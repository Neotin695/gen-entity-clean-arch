import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';

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
        const baseClassName = toPascalCase(
          modelName.endsWith('Entity') ? modelName.slice(0, -6) : modelName
        );
        const className = baseClassName + 'Entity';

        // Prompt for JSON input
        const jsonInput = await vscode.window.showInputBox({
          placeHolder: 'Enter JSON structure for the model fields',
        });
        if (!jsonInput) {
          vscode.window.showErrorMessage('JSON input is required.');
          return;
        }

        let fields: any;
        try {
          const normalized = normalizeInput(jsonInput);
          fields = JSON5.parse(normalized);
        } catch (error: any) {
          vscode.window.showErrorMessage(`Invalid JSON/JSON5. ${error?.message ?? ''}`);
          return;
        }

        // handle array root
        if (Array.isArray(fields)) {
          if (fields.length === 0) {
            vscode.window.showErrorMessage('Array is empty. Provide at least one object.');
            return;
          }
          if (fields.every((x) => typeof x === 'object' && x !== null && !Array.isArray(x))) {
            fields = mergeObjects(fields);
          } else {
            vscode.window.showErrorMessage('Root array must contain objects to infer fields.');
            return;
          }
        } else if (typeof fields !== 'object' || fields === null) {
          vscode.window.showErrorMessage('Root must be an object or an array of objects.');
          return;
        }

        // Prompt for location to save the generated file
        const entityUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          openLabel: 'Select folder to save the Entity file',
        });
        if (!entityUri || entityUri.length === 0) {
          vscode.window.showErrorMessage('No directory selected for Entity file.');
          return;
        }

        const modelUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          openLabel: 'Select folder to save the Model file',
        });
        if (!modelUri || modelUri.length === 0) {
          vscode.window.showErrorMessage('No directory selected for Model file.');
          return;
        }

        const entityDir = entityUri[0].fsPath;
        const modelDir = modelUri[0].fsPath;

        const formattedName = baseClassName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const entityFileName = `${formattedName}_entity.dart`;
        const modelFileName = `${formattedName}_model.dart`;
        const entityFilePath = path.join(entityDir, entityFileName);
        const modelFilePath = path.join(modelDir, modelFileName);

        const entityContent = generateEntityClass(className, formattedName, fields);
        const modelContent = generateModelClass(baseClassName, formattedName, fields);

        await fs.promises.writeFile(entityFilePath, entityContent, 'utf-8');
        await fs.promises.writeFile(modelFilePath, modelContent, 'utf-8');

        vscode.window.showInformationMessage(
          'Dart entity and model files generated successfully.'
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate Dart models: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

function normalizeInput(input: string): string {
  let s = input.replace(/^\uFEFF/, '').trim();

  const first = Math.min(...[s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0));
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (first >= 0 && lastBrace > first) {
    s = s.slice(first, lastBrace + 1).trim();
  }

  if (s.startsWith('{') || s.startsWith('[')) return s;

  if (/^"[^"]+"\s*:/.test(s) || /^[A-Za-z0-9_$\-]+\s*:/.test(s)) {
    return `{${s}}`;
  }

  const lines = s.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    const body = lines
      .map((l) => l.replace(/^\s*([A-Za-z0-9_$\-]+)\s*:/, '"$1":'))
      .join(',');
    return `{${body}}`;
  }

  return s;
}

function generateEntityClass(className: string, formattedName: string, fields: any): string {
  let serializationMethods = generateSerializationMethods(fields);
  let nestedClasses = generateNestedClasses(fields, className);
  let entityFields = Object.keys(fields)
    .map((key, index) => {
      const fieldType = inferType(fields[key], toPascalCase(key));
      const jsonKeyAnnotation =
        typeof fields[key] === 'object' && fields[key] !== null
          ? `  @JsonKey(fromJson: ${key}FromMap, toJson: ${key}ToMap)\n  `
          : '';
      return `  @HiveField(${index})\n  ${jsonKeyAnnotation}final ${fieldType} ${key};`;
    })
    .join('\n\n');

  let constructorParams = Object.keys(fields)
    .map((key) => `    required this.${key},`)
    .join('\n');

  return `

import '../models/${formattedName}_model.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
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

  factory ${className}.empty() => ${className}(
    ${Object.keys(fields)
      .map((key) => `${key}: ${getDefaultValue(fields[key], key)},`)
      .join('\n')}
  );
  ${serializationMethods}
}
  
${nestedClasses}
`;
}

function getDefaultValue(value: any, key: string = ''): string {
  if (typeof value === 'number') {
    return '0';
  } else if (typeof value === 'string') {
    return "''";
  } else if (typeof value === 'boolean') {
    return 'false';
  } else if (Array.isArray(value)) {
    return '[]';
  } else if (typeof value === 'object' && value !== null) {
    return `${toPascalCase(key)}Entity.empty()`;
  } else {
    return 'null';
  }
}

function generateModelClass(baseClassName: string, formattedName: string, fields: any): string {
  let constructorParams = Object.keys(fields)
    .map((key) => `    required super.${key},`)
    .join('\n');

  return `import 'package:freezed_annotation/freezed_annotation.dart';
import '../../entities/${formattedName}_entity.dart';

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

function toPascalCase(str: string): string {
  return str.replace(/(?:^|_)([a-z])/g, (_, letter) => letter.toUpperCase());
}

function generateSerializationMethods(fields: any): string {
  let methods = Object.keys(fields)
    .filter(
      (key) =>
        Array.isArray(fields[key]) || (typeof fields[key] === 'object' && fields[key] !== null)
    )
    .map((key) => {
      if (Array.isArray(fields[key])) {
        const itemType = inferType(fields[key][0], toPascalCase(key));
        return `
      static List<${itemType}> ${key}FromMap(List<dynamic> json) {
    return json.map((e) => ${itemType}.fromJson(e)).toList();
  }

  static List<Map<String, dynamic>> ${key}ToMap(List<${itemType}> items) {
    return items.map((e) => e.toJson()).toList();
  }
  `;
      } else {
        return `
  static ${inferType(fields[key], toPascalCase(key))} ${key}FromMap(Map<String, dynamic> json) {
    return ${inferType(fields[key], toPascalCase(key))}.fromJson(json);
  }

  static Map<String, dynamic> ${key}ToMap(${inferType(fields[key], toPascalCase(key))} instance) {
    return instance.toJson();
  }
  `;
      }
    })
    .join('\n');

  return methods.length > 0 ? methods : '';
}

function mergeObjects(arr: any[]): any {
  return arr.reduce((acc, obj) => {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        if (!(key in acc)) {
          acc[key] = obj[key];
        } else {
          const currentType = inferType(acc[key], toPascalCase(key));
          const newType = inferType(obj[key], toPascalCase(key));
          if (currentType !== newType) {
            acc[key] = null;
          }
        }
      });
    }
    return acc;
  }, {});
}

function inferListType(arr: any[], parentClassName: string): string {
  const types = arr.map((item) => inferType(item, parentClassName));
  if (types.every((t) => t === types[0])) {
    return types[0];
  } else {
    return 'dynamic';
  }
}

function inferType(value: any, parentClassName: string = ''): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  } else if (typeof value === 'string') {
    return 'String';
  } else if (typeof value === 'boolean') {
    return 'bool';
  } else if (Array.isArray(value)) {
    if (value.length > 0) {
      if (typeof value[0] === 'object' && value[0] !== null) {
        return `List<${toPascalCase(parentClassName)}Entity>`;
      } else {
        const itemType = inferListType(value, toPascalCase(parentClassName));
        return `List<${itemType}>`;
      }
    }
    return 'List<dynamic>';
  } else if (typeof value === 'object' && value !== null) {
    return toPascalCase(parentClassName) + 'Entity';
  } else if (value === null) {
    return 'dynamic';
  } else {
    return 'dynamic';
  }
}

function generateNestedClasses(fields: any, parentClassName: string): string {
  let nestedClasses = '';

  Object.keys(fields).forEach((key) => {
    if (
      Array.isArray(fields[key]) &&
      fields[key].length > 0 &&
      typeof fields[key][0] === 'object'
    ) {
      let sampleObject =
        fields[key].length > 1 ? mergeObjects(fields[key]) : fields[key][0];
      const nestedClassName = toPascalCase(key) + 'Entity';

      nestedClasses += `
class ${nestedClassName} {
  ${Object.keys(sampleObject)
    .map((nestedKey) => {
      const fieldType = inferType(
        sampleObject[nestedKey],
        toPascalCase(nestedKey) + 'Entity'
      );
      return `final ${fieldType} ${nestedKey};`;
    })
    .join('\n  ')}

  ${nestedClassName}({
    ${Object.keys(sampleObject)
      .map((nestedKey) => `required this.${nestedKey},`)
      .join('\n    ')}
  });

  factory ${nestedClassName}.empty() => ${nestedClassName}(
    ${Object.keys(sampleObject)
      .map(
        (nestedKey) =>
          `${nestedKey}: ${getDefaultValue(sampleObject[nestedKey], nestedKey)},`
      )
      .join('\n    ')}
  );

  factory ${nestedClassName}.fromJson(Map<String, dynamic> json) {
    return ${nestedClassName}(
      ${Object.keys(sampleObject)
        .map((nestedKey) => `${nestedKey}: json['${nestedKey}'],`)
        .join('\n      ')}
    );
  }

  Map<String, dynamic> toJson() => {
    ${Object.keys(sampleObject)
      .map((nestedKey) => `'${nestedKey}': ${nestedKey},`)
      .join('\n    ')}
  };
}
`;
      nestedClasses += generateNestedClasses(sampleObject, nestedClassName);
    } else if (
      typeof fields[key] === 'object' &&
      fields[key] !== null &&
      !Array.isArray(fields[key])
    ) {
      const nestedClassName = toPascalCase(key) + 'Entity';
      nestedClasses += `
class ${nestedClassName} {
  ${Object.keys(fields[key])
    .map((nestedKey) => {
      const fieldType = inferType(
        fields[key][nestedKey],
        toPascalCase(nestedKey) + 'Entity'
      );
      return `final ${fieldType} ${nestedKey};`;
    })
    .join('\n  ')}

  ${nestedClassName}({
    ${Object.keys(fields[key])
      .map((nestedKey) => `required this.${nestedKey},`)
      .join('\n    ')}
  });

  factory ${nestedClassName}.empty() => ${nestedClassName}(
    ${Object.keys(fields[key])
      .map(
        (nestedKey) =>
          `${nestedKey}: ${getDefaultValue(fields[key][nestedKey], nestedKey)},`
      )
      .join('\n    ')}
  );

  factory ${nestedClassName}.fromJson(Map<String, dynamic> json) {
    return ${nestedClassName}(
      ${Object.keys(fields[key])
        .map((nestedKey) => `${nestedKey}: json['${nestedKey}'],`)
        .join('\n      ')}
    );
  }

  Map<String, dynamic> toJson() => {
    ${Object.keys(fields[key])
      .map((nestedKey) => `'${nestedKey}': ${nestedKey},`)
      .join('\n    ')}
  };
}
`;
      nestedClasses += generateNestedClasses(fields[key], nestedClassName);
    }
  });

  return nestedClasses;
}
