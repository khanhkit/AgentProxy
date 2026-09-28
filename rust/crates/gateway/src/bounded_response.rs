use std::{error::Error, fmt};

use futures_util::StreamExt;

#[derive(Debug)]
pub(crate) enum BoundedResponseError {
    TooLarge { max_bytes: usize },
    Transport(reqwest::Error),
}

impl fmt::Display for BoundedResponseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge { max_bytes } => {
                write!(f, "response body exceeds {max_bytes}-byte limit")
            }
            Self::Transport(error) => write!(f, "response body read failed: {error}"),
        }
    }
}

impl Error for BoundedResponseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::TooLarge { .. } => None,
            Self::Transport(error) => Some(error),
        }
    }
}

pub(crate) async fn read_bounded_response(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, BoundedResponseError> {
    if response
        .content_length()
        .is_some_and(|declared| declared > max_bytes as u64)
    {
        return Err(BoundedResponseError::TooLarge { max_bytes });
    }

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(BoundedResponseError::Transport)?;
        if chunk.len() > max_bytes.saturating_sub(body.len()) {
            return Err(BoundedResponseError::TooLarge { max_bytes });
        }
        body.extend_from_slice(&chunk);
    }

    Ok(body)
}
