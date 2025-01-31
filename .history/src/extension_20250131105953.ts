import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'gen-entity-clean-arch.helloWorld',
    async () => {
      try {
        // Prompt for model class name
        const modelName = await vscode.window.showInputBox({
          placeHolder: 'Enter the main model class name (e.g., CarEntity)',
        });
        if (!modelName) {
          vscode.window.showErrorMessage('Model class name is required.');
          return;
        }

        // Remove 'Entity' from class name if it exists
        const baseClassName = modelName.endsWith('Entity') ? modelName.slice(0, -6) : modelName;
        const className = baseClassName + 'Entity';

        // Prompt for JSON input
        const jsonInput = await vscode.window.showInputBox({
          placeHolder: 'Enter JSON structure for the model fields',
        });
        if (!jsonInput) {
          vscode.window.showErrorMessage('JSON input is required.');
          return;
        }

        let fields;
        try {
          fields = JSON.parse(jsonInput);
        } catch (error) {
          vscode.window.showErrorMessage('Invalid JSON format. Please check your input.');
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
        const formattedName = baseClassName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const entityFileName = `${formattedName}_entity.dart`;
        const modelFileName = `${formattedName}_model.dart`;
        const entityFilePath = path.join(targetDir, entityFileName);
        const modelFilePath = path.join(targetDir, modelFileName);
        
        const entityContent = generateEntityClass(className, formattedName, fields);
        const modelContent = generateModelClass(baseClassName, formattedName, fields);
        
        await fs.promises.writeFile(entityFilePath, entityContent, 'utf-8');
        await fs.promises.writeFile(modelFilePath, modelContent, 'utf-8');

        vscode.window.showInformationMessage(
          'Dart entity and model files generated successfully.'
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to generate Dart models: ${error}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

function generateEntityClass(className: string, formattedName: string, fields: any): string {
  let entityFields = Object.keys(fields)
    .map((key, index) => `  @HiveField(${index})\n  final ${inferType(fields[key])} ${key};`)
    .join('\n\n');

  let constructorParams = Object.keys(fields)
    .map((key) => `    required this.${key},`)
    .join('\n');

  return `import 'package:hive/hive.dart';
import 'package:auto_mappr_annotation/auto_mappr_annotation.dart';

part '${formattedName}_entity.g.dart';

@HiveType(typeId: 3)
@AutoMappr([
  MapType<${className.replace('Entity', 'Model')}, ${className}>(),
])
class ${className} extends \$${className} {
${entityFields}

  ${className}({
${constructorParams}
  });

  factory ${className}.fromModel(${className.replace('Entity', 'Model')} model) =>
      const \$${className}().convert<${className.replace('Entity', 'Model')}, ${className}>(model);
}`;
}

function generateModelClass(baseClassName: string, formattedName: string, fields: any): string {
  let constructorParams = Object.keys(fields)
    .map((key) => `    required super.${key},`)
    .join('\n');

  let toMapBody = Object.keys(fields)
    .map((key) => `      '${key}': ${key},`)
    .join('\n');

  return `import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:prezza/features/cars/domain/entities/${formattedName}_entity.dart';

part '${formattedName}_model.g.dart';

@JsonSerializable()
class ${baseClassName}Model extends ${baseClassName}Entity {
  ${baseClassName}Model({
${constructorParams}
  });

  factory ${baseClassName}Model.fromMap(Map<String, dynamic> json) =>
      _\$${baseClassName}ModelFromJson(json);

  Map<String, dynamic> toMap() =>
      _\$${baseClassName}ModelToJson(this);
}`;
}

function inferType(value: any): string {
  if (typeof value === 'number') {
    return 'int';
  } else if (typeof value === 'string') {
    return 'String';
  } else if (typeof value === 'boolean') {
    return 'bool';
  } else if (Array.isArray(value)) {
    return 'List<dynamic>';
  } else if (typeof value === 'object' && value !== null) {
    return 'Map<String, dynamic>';
  } else {
    return 'dynamic';
  }
}
