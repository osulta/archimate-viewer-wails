package apiserver

import "testing"

func TestDecodeXMLEntities(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`Technology &amp; Physical`, `Technology & Physical`},
		{`"Quoted"`, `"Quoted"`},
		{`&quot;Quoted&quot;`, `"Quoted"`},
		{`no entities`, `no entities`},
		{`&#38;`, `&`},
		{`&#x26;`, `&`},
	}

	for _, tc := range tests {
		if got := decodeXMLEntities(tc.input); got != tc.expected {
			t.Fatalf("decodeXMLEntities(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}
