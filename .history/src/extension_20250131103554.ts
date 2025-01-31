import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'gen-entity-clean-arch.helloWorld',
    async () => {
      try {
        // Prompt for model class name
        const modelName = await vscode.window.showInputBox({
          placeHolder: 'Enter the main model class name (e.g., ClassName)',
        });
        if (!modelName) {
          vscode.window.showErrorMessage('Model class name is required.');
          return;
        }

        // Prompt for JSON input
        const jsonInput = await vscode.window.showInputBox({
          placeHolder: 'Enter JSON data to generate models',
        });
        if (!jsonInput) {
          vscode.window.showErrorMessage('JSON data is required.');
          return;
        }

        let jsonData;
        try {
          jsonData = JSON.parse(jsonInput);
        } catch (error) {
          vscode.window.showErrorMessage('Invalid JSON format.');
          return;
        }

        // Prompt for location to save the generated file
        const targetUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          openLabel: 'Select folder to save the generated model file',
        });
        if (!targetUri || targetUri.length === 0) {
          vscode.window.showErrorMessage('No target directory selected.');
          return;
        }

        const targetDir = targetUri[0].fsPath;
        const modelContent = generateDartModelFile(modelName, jsonData);

        const fileName = `${modelName.toLowerCase().replace(/entity/, '')}_entity.dart`;
        const filePath = path.join(targetDir, fileName);
        await fs.promises.writeFile(filePath, modelContent, 'utf-8');

        vscode.window.showInformationMessage(
          'Dart model file generated successfully.'
        );
         vscode.window.showInformationMessage("Running build_runner to generate .g.dart file...");
      exec('dart run build_runner build', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath }, (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(`Error running build_runner: ${stderr}`);
          return;
        }
        vscode.window.showInformationMessage("Successfully generated .g.dart file.");
      });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to generate Dart models: ${error}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

// Generate a single Dart file with the main model at the top and sub-models below
function generateDartModelFile(
  className: string,
  jsonData: { [key: string]: any }
): string {
  // Define models as a record of string keys and string values
  const models: Record<string, string> = {};
  generateDartModels(className, jsonData, models);

  // Extract main model first, then append sub-models
  const mainModel = models[className];
  const subModels = Object.keys(models)
    .filter((key) => key !== className)
    .map((key) => models[key])
    .join('\n\n');

  return `${mainModel}\n\n${subModels}`;
}

// Main function to recursively generate Dart models
function generateDartModels(
  className: string,
  jsonData: { [key: string]: any },
  models: Record<string, string> = {}, // Use explicit Record type for models
  isMainClass: boolean = true
): void {
  const fields = Object.keys(jsonData)
    .map((key,index) => {
      const value = jsonData[key];
      const type = inferType(value, capitalize(key), models);

      // Add @JsonKey only for the main class
      if (isMainClass && typeof value === 'object' && value !== null) {
        return `
         @HiveField(${index})
        @JsonKey(fromJson: ${capitalize(
          key
        )}.fromMap, toJson: ${key}ToMap)\n  final ${type} ${key};`;
      }

      return ` 
      @HiveField(${index})
      final ${type} ${key};`;
    })
    .join('\n\n');

  const constructorArgs = Object.keys(jsonData)
    .map((key) => `required this.${key},`)
    .join('\n    ');

 const imports = `
${isMainClass ? "import 'package:hive/hive.dart';" : ''}
${isMainClass ? "import 'package:freezed_annotation/freezed_annotation.dart';" : ''}
${isMainClass ? "import 'package:auto_mappr_annotation/auto_mappr_annotation.dart';" : ''}
import 'package:equatable/equatable.dart';
`;

  const partFile = isMainClass
    ? `part '${className.toLowerCase().replace(/entity$/, '_entity')}.g.dart';`
    : '';

  const hiveTypeAnnotation =  `@HiveType(typeId: ${Math.floor(Math.random() * 100)})`;`


  `
  const autoMapprAnnotation = isMainClass
    ? `
@AutoMappr([
  MapType<${className.replace(/Entity/,'Model')}, ${className}>(),
])
`
    : '';

  const serializationMethods = isMainClass
    ? `
  // Static serialization methods for nested objects
${Object.keys(jsonData)
        .filter((key) => typeof jsonData[key] === 'object')
        .map(
          (key) =>
            `  static Map<String, dynamic> ${key}ToMap(${capitalize(
              key
            )} ${key}) => ${key}.toMap();`
        )
        .join('\n')}
`
    : `
  Map<String, dynamic> toMap() {
    return {
${Object.keys(jsonData)
        .map((key) => `      '${key}': ${key},`)
        .join('\n')}
    };
  }

  factory ${className}.fromMap(Map<String, dynamic> map) {
    return ${className}(
${Object.keys(jsonData)
        .map((key) =>
          typeof jsonData[key] === 'object'
            ? `      ${key}: ${capitalize(key)}.fromMap(map['${key}']),`
            : `      ${key}: map['${key}'],`
        )
        .join('\n')}
    );
  }
`;

  const classContent = `
${isMainClass ? imports : ''}

${partFile}
${hiveTypeAnnotation}
${autoMapprAnnotation}
class ${className} extends ${isMainClass ? `$${className}` : 'Equatable'} {
${fields}

  ${className}({
    ${constructorArgs}
  });

  ${isMainClass ? ` 
  factory ${className}.fromModel( ${className.replace(/Entity/,'Model')} model) =>
      const $${className}().convert< ${className.replace(/Entity/,'Model')}, ${className}>(model);`:
      ''}

${serializationMethods}

${isMainClass ? '' : '  @override\n  List<Object?> get props => [' + Object.keys(jsonData).join(', ') + '];'}
}
`;

  models[className] = classContent;
}

// Helper function to determine Dart types
function inferType(
  value: any,
  keyName: string,
  models: Record<string, string> // Explicit Record type for models
): string {
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return value % 1 === 0 ? 'int' : 'double';
  if (typeof value === 'boolean') return 'bool';
  if (Array.isArray(value)) {
    if (typeof value[0] === 'object' && value[0] !== null) {
      const nestedClassName = capitalize(keyName);
      generateDartModels(nestedClassName, value[0], models, false);
      return `List<${nestedClassName}>`;
    }
    return `List<${inferType(value[0], keyName, models)}>`;
  }
  if (typeof value === 'object' && value !== null) {
    const nestedClassName = capitalize(keyName);
    generateDartModels(nestedClassName, value, models, false);
    return nestedClassName;
  }
  return 'dynamic';
}

// Helper function to capitalize class names
function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
