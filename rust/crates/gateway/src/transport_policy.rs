use std::net::IpAddr;

/// Validate a secret-bearing outbound endpoint before any network I/O.
///
/// HTTPS is allowed. Cleartext HTTP is allowed only for explicit loopback
/// destinations used by the local-first control/legacy topology. Other schemes,
/// embedded credentials, and remote cleartext HTTP are rejected.
pub(crate) fn validate_secret_bearing_url(input: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(input)
        .map_err(|error| format!("invalid secret-bearing endpoint URL: {error}"))?;

    if !url.username().is_empty() || url.password().is_some() {
        return Err("secret-bearing endpoint URL must not contain embedded credentials".to_owned());
    }

    match url.scheme() {
        "https" => Ok(url),
        "http" if is_explicit_loopback(&url) => Ok(url),
        "http" => Err("cleartext HTTP is allowed only for explicit loopback endpoints".to_owned()),
        scheme => Err(format!(
            "unsupported secret-bearing endpoint URL scheme: {scheme}"
        )),
    }
}

fn is_explicit_loopback(url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_matches(['[', ']'])
        .parse::<IpAddr>()
        .is_ok_and(|ip| ip.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_https_and_explicit_loopback_http() {
        assert!(validate_secret_bearing_url("https://example.com/api").is_ok());
        assert!(validate_secret_bearing_url("http://localhost:20129/api").is_ok());
        assert!(validate_secret_bearing_url("http://127.0.0.1:20129/api").is_ok());
        assert!(validate_secret_bearing_url("http://[::1]:20129/api").is_ok());
    }

    #[test]
    fn rejects_remote_cleartext_and_embedded_credentials() {
        assert!(validate_secret_bearing_url("http://192.168.1.10:20129/api").is_err());
        assert!(validate_secret_bearing_url("http://203.0.113.10/api").is_err());
        assert!(validate_secret_bearing_url("https://user:pass@example.com/api").is_err());
        assert!(validate_secret_bearing_url("ftp://example.com/api").is_err());
    }
}
