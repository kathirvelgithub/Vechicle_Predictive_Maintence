package com.resumeos.auth_service.entity;

public enum Role {
    USER,                   // Default / Fallback
    ADMIN,                  // Legacy Admin

    // New roles matching your React form
    SERVICE_MANAGER,
    MANUFACTURING_ENGINEER,
    SYSTEM_ADMIN;
}