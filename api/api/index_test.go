package handler

import (
	"net/http/httptest"
	"testing"
)

func TestRestorePath(t *testing.T) {
	cases := []struct{ in, wantPath, wantQuery string }{
		{"/api/index?__path=api%2Fhealth", "/api/health", ""},
		{"/api/index?__path=api/songs/12&q=hello&archived=1", "/api/songs/12", "archived=1&q=hello"},
		{"/api/index?__path=", "/", ""},
		{"/api/health", "/api/health", ""}, // no rewrite (local dev) — untouched
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", c.in, nil)
		restorePath(r)
		if r.URL.Path != c.wantPath || r.URL.RawQuery != c.wantQuery {
			t.Errorf("%s: got %q ?%q, want %q ?%q", c.in, r.URL.Path, r.URL.RawQuery, c.wantPath, c.wantQuery)
		}
	}
}
