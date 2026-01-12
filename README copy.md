# Resources & Dependencies

This application is responsible for the Resource and Dependencies applications. These apps can be located on **Processes**, **Products & Services**, and **Applications**.

## 🔌 LCAP RPC Connector

This RPC connector tool enables local use of `_RB` queries. This is the first thing you will see upon starting the app locally. It is important because you will be able to develop in traditional fashion, making queries locally. This is preferable to having to make a build, upload to the dev tenant, and navigate to the place where your changes were implemented. It is important to know the few small steps necessary to get this working correctly.

## 🚀 Features

- Establishes an RPC bridge between a local React app and the Everbridge platform.
- Supports calling `_RB` functions (e.g., `_RB.selectQuery`) directly from your local environment.
- Provides an interactive interface for testing, inspecting results, and handling errors.
- Enforces secure communication using origin and nonce validation.

1. **`rpcListener.js` (Platform Script)**  
   A script injected into the platform via the browser console to:
   - Listen for messages from the local app.
   - Validate requests (origin and nonce).
   - Execute `_RB` functions in the platform context.
   - Return the results back to the local client.

2. **`popupClient.ts` (RPC Utility)**  
   Defines helper methods for creating a popup connection and message passing between the local client and platform tab.

---

## ⚙️ Running Locally

### 1. Install and start the app

```bash
npm install
npm run dev
```

### 2. Connect to RPC to make `_RB` requests

- Click connect to platform
- After the window opens, paste the entirety of rpcListener.js in to the console of the opened window
- Navigate to the React app. Refresh if necessary, the connection will persist.
- You can now test the example `_RB` query, or proceed to the actual **Resources & Dependencies** application for local development.

## Extensions

It is highly recommended to download tailwind intellisense. This will allow you to see styles on your classNames and what those tailwind classes do.
