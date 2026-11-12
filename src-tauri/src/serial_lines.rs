#[derive(Default)]
pub(super) struct SerialLineBuffer {
    partial: Vec<u8>,
}

impl SerialLineBuffer {
    pub(super) fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        for &byte in bytes {
            if byte == b'\n' {
                while self.partial.last() == Some(&b'\r') {
                    self.partial.pop();
                }
                let line = String::from_utf8_lossy(&self.partial).trim().to_string();
                if !line.is_empty() {
                    lines.push(line);
                }
                self.partial.clear();
            } else {
                self.partial.push(byte);
            }
        }
        lines
    }

    pub(super) fn take_partial(&mut self) -> Option<String> {
        let partial = String::from_utf8_lossy(&self.partial).trim().to_string();
        self.partial.clear();
        (!partial.is_empty()).then_some(partial)
    }
}

pub(super) fn route_query_lines(
    lines: Vec<String>,
    reply_received: bool,
) -> (Option<String>, Vec<String>) {
    if reply_received {
        return (None, lines);
    }

    let mut lines = lines.into_iter();
    let reply = lines.next();
    (reply, lines.collect())
}

#[cfg(test)]
mod tests {
    use super::{route_query_lines, SerialLineBuffer};

    #[test]
    fn preserves_every_line_when_one_read_contains_multiple_replies() {
        let mut lines = SerialLineBuffer::default();
        assert_eq!(
            lines.push(b"[sys.a?|1]\r\n[sys.b?|2]\n"),
            vec!["[sys.a?|1]", "[sys.b?|2]"]
        );
    }

    #[test]
    fn keeps_fragmented_line_bytes_until_newline_arrives() {
        let mut lines = SerialLineBuffer::default();
        assert!(lines.push(b"[sys.swver?|Wheel").is_empty());
        assert_eq!(
            lines.push(b"Forge 1.0]\r\n"),
            vec!["[sys.swver?|WheelForge 1.0]"]
        );
    }

    #[test]
    fn exposes_an_unterminated_fragment_before_a_new_query() {
        let mut lines = SerialLineBuffer::default();
        assert!(lines.push(b"partial stale data").is_empty());
        assert_eq!(lines.take_partial().as_deref(), Some("partial stale data"));
        assert!(lines.push(b"\n").is_empty());
    }

    #[test]
    fn routes_one_reply_and_keeps_every_additional_line() {
        let (reply, unsolicited) =
            route_query_lines(vec!["reply".into(), "second".into(), "third".into()], false);
        assert_eq!(reply.as_deref(), Some("reply"));
        assert_eq!(unsolicited, vec!["second", "third"]);
    }
}
