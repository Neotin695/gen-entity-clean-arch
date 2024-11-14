import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('gen-entity-clean-arch.helloWorld', async () => {
    try {
      // Prompt for model class name
      const modelName = await vscode.window.showInputBox({
        placeHolder: "Enter the main model class name (e.g., UserEntity)"
      });
      if (!modelName) {
        vscode.window.showErrorMessage("Model class name is required.");
        return;
      }

      // Prompt for JSON input
      const jsonInput = await vscode.window.showInputBox({
        placeHolder: "Enter JSON data to generate models"
      });
      if (!jsonInput) {
        vscode.window.showErrorMessage("JSON data is required.");
        return;
      }

      let jsonData;
      try {
        jsonData = JSON.parse(jsonInput);
      } catch (error) {
        vscode.window.showErrorMessage("Invalid JSON format.");
        return;
      }

      // Prompt for location to save the generated files
      const targetUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        openLabel: "Select folder to save the generated model files"
      });
      if (!targetUri || targetUri.length === 0) {
        vscode.window.showErrorMessage("No target directory selected.");
        return;
      }

      const targetDir = targetUri[0].fsPath;
      const models = generateDartModels(modelName, jsonData);

      // Write each generated model file
      for (const [className, content] of Object.entries(models)) {
        const fileName = `${className.toLowerCase().replace(/entity$/, "_entity")}.dart`;
        const filePath = path.join(targetDir, fileName);
        await fs.promises.writeFile(filePath, content, 'utf-8');
      }

      vscode.window.showInformationMessage("Dart models generated successfully.");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate Dart models: ${error}`);
    }
  });

  context.subscriptions.push(disposable);
}

// Main function to recursively generate Dart models for the main class and nested objects
function generateDartModels(
  className: string,
  jsonData: { [key: string]: any },
  models: { [key: string]: string } = {}
): { [key: string]: string } {
  const fields = Object.keys(jsonData).map(key => {
    const value = jsonData[key];
    const type = inferType(value, capitalize(key), models);
    return `  final ${type} ${key};`;
  }).join('\n');

  const constructorArgs = Object.keys(jsonData)
    .map(key => `required this.${key},`)
    .join('\n    ');

  // Generate the imports for nested classes
  const imports = Object.keys(models)
    .filter(model => model !== className)
    .map(model => `import '${model.toLowerCase()}.dart';`)
    .join('\n');

  // Generate the Dart class content with imports
  const modelContent = `
${imports}

class ${className} {
${fields}

  ${className}({
    ${constructorArgs}
  });
}
`;
  models[className] = modelContent;
  return models;
}

// Helper function to infer Dart type from JSON value
function inferType(value: any, keyName: string, models: { [key: string]: string }): string {
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return value % 1 === 0 ? 'int' : 'double';
  if (typeof value === 'boolean') return 'bool';
  if (Array.isArray(value)) {
    if (typeof value[0] === 'object' && value[0] !== null) {
      const nestedClassName = capitalize(keyName);
      generateDartModels(nestedClassName, value[0], models);
      return `List<${nestedClassName}>`;
    }
    return `List<${inferType(value[0], keyName, models)}>`;
  }
  if (typeof value === 'object' && value !== null) {
    const nestedClassName = capitalize(keyName);
    generateDartModels(nestedClassName, value, models);
    return nestedClassName;
  }
  return 'dynamic';
}

// Helper function to capitalize the class name
function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
