pub fn strip_to_plain_text(input: &str) -> String {
    input.replace("\r\n", "\n").replace('\r', "\n")
}
