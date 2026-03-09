package com.resumeos.auth_service.dto;


import lombok.Data;

@Data
public class RegisterRequest {
    private String fullName;
    private String email;
    private String password;
    private String role;
    private String location;
    private String plant;
}
