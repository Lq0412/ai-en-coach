package assistant_test

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

func TestExtractResumeTextFormats(t *testing.T) {
	text, err := assistant.ExtractResumeText("resume.txt", []byte("Go engineer\nKafka experience"))
	if err != nil || !strings.Contains(text, "Kafka") {
		t.Fatalf("extract TXT = %q, %v", text, err)
	}

	var document bytes.Buffer
	writer := zip.NewWriter(&document)
	file, err := writer.Create("word/document.xml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte(`<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Distributed systems</w:t></w:r></w:p><w:p><w:r><w:t>Reduced latency by 60%</w:t></w:r></w:p></w:body></w:document>`)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	text, err = assistant.ExtractResumeText("resume.docx", document.Bytes())
	if err != nil || !strings.Contains(text, "Distributed systems") || !strings.Contains(text, "60%") {
		t.Fatalf("extract DOCX = %q, %v", text, err)
	}
}

func TestExtractResumeTextRejectsUnsupportedPDFExplicitly(t *testing.T) {
	_, err := assistant.ExtractResumeText("resume.pdf", []byte("%PDF-1.7"))
	if err == nil || !strings.Contains(err.Error(), "PDF text extraction is not available") {
		t.Fatalf("PDF error = %v", err)
	}
}
