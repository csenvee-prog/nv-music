# NV Music - Product Specification

## Project Overview
NV Music is a mobile music player application built with Expo and React Native. The app provides a modern, intuitive interface for playing, managing, and discovering music with a distinctive visual identity.

## Target Audience
- Music listeners who want a clean, intuitive playback experience
- Power users who value quick access to playback controls and library management
- Mobile users who need one-handed operation and thumb-friendly layouts

## Core Features
- **Playback controls**: Play/pause, skip previous/next, seek bar with tap-to-seek
- **Queue management**: Add tracks to queue, shuffle mode, repeat (off/track/all)
- **Liked songs**: Toggle like/unlike on individual tracks
- **Now playing screen**: Full-screen track view with album art, progress, and controls
- **Mini player**: Persistent bottom player that follows navigation
- **Library navigation**: Browse tracks, albums, search, and liked songs

## Design Language
- **Color scheme**: Marshmallow white (#fdf6e3) base with galactic violet (#7f1d7f) primary accent and bubblegum pink (#ff6b6b) highlight
- **Typography**: System fonts (system-ui/iOS, normal/default, var(--font-display) web)
- **Spacing**: Consistent 4px grid via Spacing tokens (half: 2, one: 4, two: 8, three: 12, four: 16, five: 24, six: 32)
- **Elevation**: Subtle shadows (elevation 2-4) on elevated surfaces
- **Border radius**: Rounded corners (2-18px) throughout UI

## Technical Platform
- **Framework**: Expo 51+ with React Native
- **Routing**: Expo Router (file-based routing in src/app/)
- **State management**: Zustand with persistence (player store, likes store)
- **Audio service**: Custom audio service for playback control
- **Platforms**: iOS, Android, Web

## Known State
- This project was transformed from Apple Music-inspired charcoal/teal palette to marshmallow white/galactic violet/bubblegum pink
- All icon-only buttons now have accessibility labels
- Error messages use plain language
- Focus-visible styles added for web accessibility
- Color tokens defined in src/constants/theme.ts

## Design Goals
- Distinctive visual identity that stands apart from category leaders
- Accessible design with full keyboard/screen-reader support
- Minimalist aesthetic with purposeful color accents
- Intuitive interaction patterns with low cognitive load