# ComfyGen - SillyTavern Image Generation Extension

A SillyTavern third-party extension that integrates with the ComfyGen (Stupid Image Generation) system for AI-powered image generation directly within your chat conversations.

## Features

- **Seamless Integration**: Automatically detects image generation markers in chat messages
- **Preset Management**: Select from your saved presets on the ComfyGen platform
- **Real-time Progress**: Visual progress bar during image generation
- **Global Prompts**: Add default positive/negative prompts to all generations
- **Auto-retry**: Automatically retry failed generation tasks
- **NSFW Blur**: Optional blur filter for generated images
- **Image Actions**: Quick copy link and download buttons

## Installation

### Method 1: Manual Installation

1. Navigate to your SillyTavern installation directory
2. Go to `public/scripts/extensions/third-party/`
3. Create a folder named `ComfyGen`
4. Copy all files from this extension into the `ComfyGen` folder:
   - `manifest.json`
   - `index.js`
   - `settings.html`
   - `style.css`

### Method 2: Git Clone

```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/CMJLevi/SillyTavern-ComfyGen.git ComfyGen
```

### Method 3: Extension Installer

1. Open SillyTavern
2. Go to Extensions > Install Extension
3. Enter the repository URL: `https://github.com/CMJLevi/SillyTavern-ComfyGen`

## Configuration

1. Open SillyTavern
2. Navigate to **Extensions** in the sidebar
3. Find **ComfyGen** and expand the settings panel
4. Configure the following:

### Server Connection
- **Server Address**: Enter your ComfyGen API server URL (e.g., `https://comfyapi.cmjlevi.top`)

#### Authentication Method 1: Username/Password (Current)
- Enter your ComfyGen account credentials
- Click **Login** to authenticate
- Note: Logging in here may invalidate tokens on other devices

#### Authentication Method 2: API Key (Coming in v1.1.0)
- Generate an API Key from your ComfyGen account settings
- Paste the API Key in the extension
- Benefits: Long-term valid, doesn't affect web login, can be revoked anytime

### Marker Format
- **Start Marker**: Default is `image###`
- **End Marker**: Default is `###`

Example usage in character card or chat:
```
image###beautiful anime girl, detailed eyes, flowing hair###
```

### Global Prompts
- **Positive Prompt**: Quality tags added to every generation (e.g., `masterpiece,best quality,`)
- **Negative Prompt**: Default negative prompts for all generations

### Advanced Settings
- **Auto Retry**: Automatically retry failed tasks (up to 3 times)
- **Show Prompt**: Display the generation prompt with results
- **NSFW Blur**: Blur images by default (hover to reveal)

## Usage

### In Character Cards

Add image markers in your character's description or prompts:

```
*The character smiles warmly*
image###smiling anime girl, warm expression, soft lighting###
```

### In Chat Messages

When the AI responds with image markers, the extension will automatically:
1. Replace the marker with a preset selector and generate button
2. Display the prompt that will be used
3. Allow you to select a preset and generate the image

### Generation Flow

1. AI message contains `image###prompt###` marker
2. Marker is replaced with generation UI
3. Select a preset from your ComfyGen account
4. Click "Generate Image"
5. Progress bar shows generation status
6. Generated image appears in the chat

## Requirements

- SillyTavern version 1.12.0 or higher
- Active ComfyGen account with at least one preset
- Internet connection to the ComfyGen API server

## Troubleshooting

### Token Expired
If you see "Token expired" errors, click the **Login** button again to re-authenticate.

### No Presets Available
Make sure you have created at least one preset on the ComfyGen platform. Click "Go to create preset" link in the extension.

### Generation Failed
- Check your internet connection
- Verify the ComfyGen server is online
- Try selecting a different preset
- Enable "Auto Retry" in settings

### Images Not Loading
- Check if the image URL is accessible
- The image might still be processing on the server
- Try refreshing the page

## File Structure

```
ComfyGen/
+-- manifest.json      # Extension metadata
+-- index.js           # Main logic entry point
+-- settings.html      # Settings panel HTML
+-- style.css          # Styles
+-- README.md          # This file
```

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/login` | POST | User authentication (username/password) |
| `/api/v1/auth/validate` | GET | Token validation |
| `/api/v1/auth/validate-key` | GET | API Key validation (v1.1.0) |
| `/api/v1/presets` | GET | List user presets |
| `/api/v1/generate/preset` | POST | Submit generation task |
| `/api/v1/generate/poll` | GET | Poll task status |

## Changelog

### v1.1.0 (Planned)
- API Key authentication support
- No more token conflicts with web login
- Improved user experience

### v1.0.0
- Initial release
- Basic image generation functionality
- Preset selection
- Progress tracking
- Auto-retry feature
- NSFW blur option

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - See LICENSE file for details.

## Credits

- Developed for integration with the ComfyGen (Stupid Image Generation) system
- Built on top of the SillyTavern extension framework
- Uses ComfyUI as the backend generation engine
