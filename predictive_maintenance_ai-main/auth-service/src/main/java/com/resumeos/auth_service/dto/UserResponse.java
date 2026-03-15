package com.resumeos.auth_service.dto;

import com.resumeos.auth_service.entity.Role;

public class UserResponse {
    private String fullName;
    private String email;
    private Role role;
    private String location;
    private String plant;

    public UserResponse() {}

    public UserResponse(String fullName, String email, Role role, String location, String plant) {
        this.fullName = fullName;
        this.email = email;
        this.role = role;
        this.location = location;
        this.plant = plant;
    }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getPlant() { return plant; }
    public void setPlant(String plant) { this.plant = plant; }

    // Manual builder
    public static UserResponseBuilder builder() { return new UserResponseBuilder(); }

    public static class UserResponseBuilder {
        private String fullName;
        private String email;
        private Role role;
        private String location;
        private String plant;

        public UserResponseBuilder fullName(String fullName) { this.fullName = fullName; return this; }
        public UserResponseBuilder email(String email) { this.email = email; return this; }
        public UserResponseBuilder role(Role role) { this.role = role; return this; }
        public UserResponseBuilder location(String location) { this.location = location; return this; }
        public UserResponseBuilder plant(String plant) { this.plant = plant; return this; }
        public UserResponse build() { return new UserResponse(fullName, email, role, location, plant); }
    }
}
