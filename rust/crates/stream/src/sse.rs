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
