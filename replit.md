# Overview

This is a WhatsApp session management application built with React, Express, and PostgreSQL. The application allows users to create and manage WhatsApp connections through either QR code scanning or phone number pairing. It provides a multi-step interface for session setup, real-time WebSocket communication for connection status updates, and persistent session storage in a PostgreSQL database.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript and Vite for development/building
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query for server state and React hooks for local state
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: Custom WebSocket hook for live session updates

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints with WebSocket support for real-time features
- **Session Management**: WhatsApp Business API integration using Baileys library
- **File Storage**: Multi-file authentication state stored locally in sessions directory
- **Error Handling**: Centralized error middleware with structured error responses
- **Development**: Hot reload with Vite middleware integration

## Data Storage
- **Database**: PostgreSQL with Neon serverless driver
- **ORM**: Drizzle ORM with schema-first approach
- **Schema**: Structured tables for users and WhatsApp sessions with status tracking
- **Migrations**: Drizzle Kit for database schema management
- **Session Persistence**: JSON storage of WhatsApp authentication state

## Authentication and Authorization
- **WhatsApp Authentication**: Multi-method pairing (QR code and phone number)
- **Session Validation**: Server-side session state management with database persistence
- **Connection Tracking**: Real-time status monitoring (pending, connected, failed, disconnected)

# External Dependencies

## Core Technologies
- **@whiskeysockets/baileys**: WhatsApp Web API client for session management
- **@neondatabase/serverless**: PostgreSQL serverless database connection
- **ws**: WebSocket server implementation for real-time communication

## UI and Styling
- **@radix-ui/***: Comprehensive set of UI primitives for accessible components
- **tailwindcss**: Utility-first CSS framework with custom design system
- **lucide-react**: Icon library for consistent iconography

## State and Data Management
- **@tanstack/react-query**: Server state management and caching
- **drizzle-orm**: Type-safe SQL ORM with PostgreSQL support
- **drizzle-zod**: Schema validation integration

## Development Tools
- **vite**: Build tool and development server
- **typescript**: Type safety across frontend and backend
- **esbuild**: Fast JavaScript bundler for production builds