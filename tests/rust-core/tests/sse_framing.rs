use agentproxy_stream::sse::SseFramer;

#[test]
fn frames_event_split_across_network_chunks_byte_identically() {
    let mut framer = SseFramer::new(1024);

    assert!(framer.push(b"event: response.cre").unwrap().is_empty());
    let frames = framer
        .push(b"ated\ndata: {\"type\":\"response.created\"}\n\n")
        .unwrap();

    assert_eq!(frames.len(), 1);
    assert_eq!(
        frames[0],
        b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n"
    );
}

#[test]
fn preserves_crlf_event_bytes() {
    let mut framer = SseFramer::new(1024);
    let input = b"event: response.created\r\ndata: {\"type\":\"response.created\"}\r\n\r\n";

    let frames = framer.push(input).unwrap();

    assert_eq!(frames, vec![input.to_vec()]);
}

#[test]
fn emits_all_complete_events_from_one_chunk() {
    let mut framer = SseFramer::new(1024);
    let first = b"data: {\"type\":\"response.created\"}\n\n";
    let second = b"data: {\"type\":\"response.in_progress\"}\n\n";
    let mut input = first.to_vec();
    input.extend_from_slice(second);

    let frames = framer.push(&input).unwrap();

    assert_eq!(frames, vec![first.to_vec(), second.to_vec()]);
}
