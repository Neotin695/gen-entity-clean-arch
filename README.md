# json2dart-arch

This VS Code extension helps convert JSON data into Dart models with clean architecture patterns.

## Features

- Generate Dart models from JSON.
- Supports custom superclass and class name input.
- Automatically includes `fromMap` and `toMap` methods.

## Usage

1. Copy JSON data to the clipboard.
2. Run the command **"Generate Dart Model from JSON"**.
3. Enter the class name and superclass name as prompted.

## Requirements

None.

## Extension Settings

This extension has the following settings:

- `dartModelGenerator.location`: Choose the location for the generated Dart model file.
- `dartModelGenerator.superClass`: Specify the superclass that the model will extend.

## Known Issues

None.

## Release Notes

### 0.0.1
- Initial release with JSON to Dart model generation.
