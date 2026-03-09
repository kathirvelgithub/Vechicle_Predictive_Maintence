package com.resumeos.auth_service.controller;

import com.resumeos.auth_service.dto.UserResponse;
import com.resumeos.auth_service.entity.User;
import com.resumeos.auth_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository repository;

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(Principal principal) {
        // principal.getName() is the email from the JWT
        User user = repository.findByEmail(principal.getName()).orElseThrow();

        return ResponseEntity.ok(UserResponse.builder()
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(user.getRole())
                .location(user.getLocation())
                .plant(user.getPlant())
                .build());
    }
}