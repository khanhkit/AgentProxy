#[derive(Debug, Clone)]
pub struct SseFramer {
    buffer: Vec<u8>,
    max_event_bytes: usize,
}

impl SseFramer {
    pub fn new(max_event_bytes: usize) -> Self {
        Self {
            buffer: Vec::new(),
            max_event_bytes,
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Vec<u8>>, SseFrameError> {
        self.buffer.extend_from_slice(chunk);
        let mut frames = Vec::new();

        while let Some(end) = find_event_end(&self.buffer) {
            if end > self.max_event_bytes {
                return Err(SseFrameError::EventTooLarge {
                    limit: self.max_event_bytes,
                });
            }
            frames.push(self.buffer.drain(..end).collect());
        }

        if self.buffer.len() > self.max_event_bytes {
            return Err(SseFrameError::EventTooLarge {
                limit: self.max_event_bytes,
            });
        }

        Ok(frames)
    }

    /// Consume only the prefix needed to complete one SSE event.
    ///
    /// The returned byte count is the number of bytes consumed from `chunk`.
    /// Bytes after the first complete frame are intentionally left for the
    /// caller to re-submit, so transport coalescing cannot make later stream
    /// data count against a pre-commit event budget.
    pub fn push_one(&mut self, chunk: &[u8]) -> Result<(Option<Vec<u8>>, usize), SseFrameError> {
        let previous_len = self.buffer.len();
        let remaining = self.max_event_bytes.saturating_sub(previous_len);
        let take = chunk.len().min(remaining);
        self.buffer.extend_from_slice(&chunk[..take]);

        if let Some(end) = find_event_end(&self.buffer) {
            if end > self.max_event_bytes {
                return Err(SseFrameError::EventTooLarge {
                    limit: self.max_event_bytes,
                });
            }

            let consumed = end.saturating_sub(previous_len).min(take);
            self.buffer.truncate(end);
            let frame = self.buffer.drain(..end).collect();
            return Ok((Some(frame), consumed));
        }

        if take < chunk.len() || self.buffer.len() >= self.max_event_bytes {
            return Err(SseFrameError::EventTooLarge {
                limit: self.max_event_bytes,
            });
        }

        Ok((None, take))
    }
}

fn find_event_end(buffer: &[u8]) -> Option<usize> {
    let lf = buffer
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|index| index + 2);
    let crlf = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4);

    match (lf, crlf) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SseFrameError {
    EventTooLarge { limit: usize },
}

#[cfg(test)]
mod tests {
    use super::{SseFrameError, SseFramer};

    #[test]
    fn push_one_stops_at_first_frame_inside_large_transport_chunk() {
        let first = b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n";
        let mut chunk = first.to_vec();
        chunk.resize(300 * 1024, b'x');

        let mut framer = SseFramer::new(64 * 1024);
        let (frame, consumed) = framer
            .push_one(&chunk)
            .expect("small first event should be accepted");

        assert_eq!(frame.as_deref(), Some(first.as_slice()));
        assert_eq!(consumed, first.len());
        assert!(chunk.len() > 256 * 1024);
    }

    #[test]
    fn push_one_still_rejects_an_oversized_first_event() {
        let mut framer = SseFramer::new(64 * 1024);
        let oversized = vec![b'x'; 64 * 1024 + 1];

        assert_eq!(
            framer.push_one(&oversized),
            Err(SseFrameError::EventTooLarge { limit: 64 * 1024 })
        );
    }
}
