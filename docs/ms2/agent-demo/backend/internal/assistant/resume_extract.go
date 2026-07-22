package assistant

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
)

const maxResumeBytes = 10 << 20

func ExtractResumeText(filename string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", errors.New("resume file is empty")
	}
	if len(data) > maxResumeBytes {
		return "", errors.New("resume file exceeds 10 MB")
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".txt", ".md":
		text := strings.TrimSpace(string(data))
		if text == "" {
			return "", errors.New("resume text is empty")
		}
		return text, nil
	case ".docx":
		return extractDOCXText(data)
	case ".pdf":
		return "", errors.New("PDF text extraction is not available in this local build; upload DOCX/TXT or paste the resume text")
	default:
		return "", errors.New("resume must be DOCX, TXT, or Markdown")
	}
}

func extractDOCXText(data []byte) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("open DOCX: %w", err)
	}
	for _, file := range reader.File {
		if file.Name != "word/document.xml" {
			continue
		}
		content, err := file.Open()
		if err != nil {
			return "", fmt.Errorf("open DOCX document: %w", err)
		}
		defer content.Close()
		decoder := xml.NewDecoder(io.LimitReader(content, maxResumeBytes))
		var parts []string
		for {
			token, err := decoder.Token()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return "", fmt.Errorf("parse DOCX document: %w", err)
			}
			start, ok := token.(xml.StartElement)
			if !ok || start.Name.Local != "t" {
				continue
			}
			var value string
			if err := decoder.DecodeElement(&value, &start); err != nil {
				return "", fmt.Errorf("parse DOCX text: %w", err)
			}
			if value = strings.TrimSpace(value); value != "" {
				parts = append(parts, value)
			}
		}
		text := strings.Join(parts, "\n")
		if text == "" {
			return "", errors.New("DOCX contains no readable text")
		}
		return text, nil
	}
	return "", errors.New("DOCX is missing word/document.xml")
}
