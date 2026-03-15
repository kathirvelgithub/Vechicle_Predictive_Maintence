package com.resumeos.auth_service.dto;


public class RegisterRequest {
    private String fullName;
    private String email;
    private String password;
    private String role;
    private String location;
    private String plant;

    // Explicit getters (avoid relying on Lombok)
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPassword() { return password; }
    public String getRole() { return role; }
    public String getLocation() { return location; }
    public String getPlant() { return plant; }

    // Optionally setters if needed (not required for current usage)
    public void setFullName(String fullName) { this.fullName = fullName; }
    public void setEmail(String email) { this.email = email; }
    public void setPassword(String password) { this.password = password; }
    public void setRole(String role) { this.role = role; }
    public void setLocation(String location) { this.location = location; }
    public void setPlant(String plant) { this.plant = plant; }
}
