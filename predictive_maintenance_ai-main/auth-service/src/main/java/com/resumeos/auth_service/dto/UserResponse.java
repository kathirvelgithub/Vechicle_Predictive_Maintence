package com.resumeos.auth_service.dto;

import com.resumeos.auth_service.entity.Role;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserResponse {
    private String fullName;
    private String email;
    private Role role;
    private String location;
    private String plant;
}
