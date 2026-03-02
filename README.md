# Actual Expo 📱

A mobile client for [Actual Budget](https://actualbudget.com/), built with Expo and React Native. This project aims to provide a local-first, privacy-focused budgeting experience on mobile devices with CRDT-based synchronization.

## Features

- **Local-first**: Your data stays on your device, ensuring speed and availability even without internet.
- **Privacy-focused**: End-to-end encryption for your financial data.
- **Synchronization**: Seamlessly syncs with your Actual Budget server using CRDTs.
- **Modern UI**: Built with React Native and Expo for a smooth native experience.

## Getting Started

### Prerequisites

- Node.js
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/barbar0jav1er/actual-expo.git
    cd actual-expo
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm start
    ```

## Development

- `npm run android`: Run on Android emulator/device.
- `npm run ios`: Run on iOS simulator/device.
- `npm run web`: Run in the browser.

## Tech Stack

- **Framework**: [Expo](https://expo.dev/)
- **UI**: [React Native](https://reactnative.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Database**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- **CRDTs**: Custom implementation for data synchronization.

## License

MIT
