package apiserver

import (
	"regexp"
	"strconv"
	"strings"
)

var xmlEntityMap = map[string]string{
	"amp":  "&",
	"lt":   "<",
	"gt":   ">",
	"quot": `"`,
	"apos": "'",
}

var reXMLEntity = regexp.MustCompile(`&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);`)

// decodeXMLEntities mirrors decodeXmlEntities from the TypeScript xml-utils.
func decodeXMLEntities(value string) string {
	if value == "" || !strings.Contains(value, "&") {
		return value
	}
	return reXMLEntity.ReplaceAllStringFunc(value, func(full string) string {
		code := full[1 : len(full)-1]
		if strings.HasPrefix(strings.ToLower(code), "#x") {
			parsed, err := strconv.ParseInt(code[2:], 16, 32)
			if err != nil {
				return full
			}
			return string(rune(parsed))
		}
		if strings.HasPrefix(code, "#") {
			parsed, err := strconv.ParseInt(code[1:], 10, 32)
			if err != nil {
				return full
			}
			return string(rune(parsed))
		}
		if decoded, ok := xmlEntityMap[code]; ok {
			return decoded
		}
		return full
	})
}
