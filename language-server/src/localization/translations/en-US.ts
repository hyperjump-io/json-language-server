export default `
# Structure
comma-expected-message = Expected a comma
colon-expected-message = Expected a colon
value-expected-message = Expected a value
brace-not-closed-message = Object is missing its closing brace
bracket-not-closed-message = Array is missing its closing bracket
unexpected-token-message = Unexpected '{$found}'
end-of-file-expected-message = Expected the end of the file
unknown-message = Syntax error '{$code}'

# Property names
property-key-expected-message = Expected a property name
property-key-not-quoted-message = Property names must be in double quotes
property-key-single-quoted-message = Property names must use double quotes instead of single quotes

# Strings
string-single-quoted-message = Strings must use double quotes instead of single quotes
string-not-closed-message = String is missing its closing quote
invalid-escape-message = Invalid escape sequence
invalid-character-message = Control characters are not allowed in strings

# Numbers and literals
number-invalid-message = '{$found}' is not a valid number
invalid-literal-message = '{$found}' is not a valid value

# Comments
comment-not-closed-message = Comment is missing its closing '*/'

# JSONC
comment-not-allowed-message = Comments are not allowed in JSON
trailing-comma-message = Trailing commas are not allowed
`;
