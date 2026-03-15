package com.resumeos.auth_service.dto;


public class AuthenticationResponse {
    private String token;

    public AuthenticationResponse() {}

    public AuthenticationResponse(String token) {
        this.token = token;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    // Manual builder to replace Lombok's @Builder
    public static AuthenticationResponseBuilder builder() { return new AuthenticationResponseBuilder(); }

    public static class AuthenticationResponseBuilder {
        private String token;
        public AuthenticationResponseBuilder token(String token) { this.token = token; return this; }
        public AuthenticationResponse build() { return new AuthenticationResponse(token); }
    }
}