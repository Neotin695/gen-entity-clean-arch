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
          placeHolder: 'Enter the main model class name (e.g., CarEntity)',
        });
        if (!modelName) {
          vscode.window.showErrorMessage('Model class name is required.');
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
        
        const entityFileName = `${modelName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}_entity.dart`;
        const modelFileName = entityFileName.replace('_entity.dart', '_model.dart');
        const entityFilePath = path.join(targetDir, entityFileName);
        const modelFilePath = path.join(targetDir, modelFileName);
        
        const entityContent = generateEntityClass(modelName);
        const modelContent = generateModelClass(modelName);
        
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

function generateEntityClass(className: string): string {
  return `import 'package:hive/hive.dart';
import 'package:auto_mappr_annotation/auto_mappr_annotation.dart';

part '${className.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}_entity.g.dart';

@HiveType(typeId: 3)
@AutoMappr([
  MapType<${className.replace('Entity', 'Model')}, ${className}>(),
])
class ${className} extends \$${className} {
  @HiveField(0)
  final String uuid;

  ${className}({required this.uuid});

  factory ${className}.fromModel(${className.replace('Entity', 'Model')} model) =>
      const \$${className}().convert<${className.replace('Entity', 'Model')}, ${className}>(model);
}`;
}

function generateModelClass(className: string): string {
  return `import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:prezza/features/cars/domain/entities/${className.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}_entity.dart';

part '${className.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}_model.g.dart';

@JsonSerializable()
class ${className.replace('Entity', 'Model')} extends ${className} {
  ${className.replace('Entity', 'Model')}({required super.uuid});

  factory ${className.replace('Entity', 'Model')}.fromMap(Map<String, dynamic> json) =>
      _\$${className.replace('Entity', 'Model')}FromJson(json);
}`;
}
