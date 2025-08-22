// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'gen-entity-clean-arch.helloWorld',
    async () => {
      try {
        // 1) اسم الكلاس الأساسي
        const modelName = await vscode.window.showInputBox({
          placeHolder: 'Enter the main model class name (e.g., CarEntity or Car)',
        });
        if (!modelName) {
          vscode.window.showErrorMessage('Model class name is required.');
          return;
        }

        const baseClassName = toPascalCase(
          modelName.endsWith('Entity') ? modelName.slice(0, -6) : modelName
        );
        const entityClass = baseClassName + 'Entity';
        const modelClass = baseClassName + 'Model';

        // 2) JSON/JSON5
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

        // 3) الجذر لازم يبقى Object أو Array<Object>
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

        // 4) أين تحفظ الملفات
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
          openLabel: 'Select folder to save the Model & Mappers files',
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
        const mappersFileName = `${formattedName}_mappers.dart`;
        const entityFilePath = path.join(entityDir, entityFileName);
        const modelFilePath = path.join(modelDir, modelFileName);
        const mappersFilePath = path.join(modelDir, mappersFileName);

        // 5) توليد الملفات
        const entityContent = generateIsarEntity(entityClass, formattedName, fields);
        const modelContent = generateModelClass(baseClassName, formattedName, fields);
        const mapperContent = generateMapperFile(baseClassName, formattedName);

        await fs.promises.writeFile(entityFilePath, entityContent, 'utf-8');
        await fs.promises.writeFile(modelFilePath, modelContent, 'utf-8');
        await fs.promises.writeFile(mappersFilePath, mapperContent, 'utf-8');

        vscode.window.showInformationMessage(
          `Generated: ${entityFileName}, ${modelFileName}, ${mappersFileName}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate files: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

/* ======================== Utils ======================== */

function normalizeInput(input: string): string {
  let s = input.replace(/^\uFEFF/, '').trim();
  const first = Math.min(...[s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0));
  const last = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (first >= 0 && last > first) s = s.slice(first, last + 1).trim();
  if (s.startsWith('{') || s.startsWith('[')) return s;

  if (/^"[^"]+"\s*:/.test(s) || /^[A-Za-z0-9_$\-]+\s*:/.test(s)) return `{${s}}`;

  const lines = s.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    const body = lines.map((l) => l.replace(/^\s*([A-Za-z0-9_$\-]+)\s*:/, '"$1":')).join(',');
    return `{${body}}`;
  }
  return s;
}

function toPascalCase(str: string): string {
  return str.replace(/(?:^|_)([a-z])/g, (_, l) => l.toUpperCase());
}

function mergeObjects(arr: any[]): any {
  return arr.reduce((acc, obj) => {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        if (!(key in acc)) {
          acc[key] = obj[key];
        } else {
          const t1 = inferType(acc[key], toPascalCase(key));
          const t2 = inferType(obj[key], toPascalCase(key));
          if (t1 !== t2) acc[key] = null;
        }
      });
    }
    return acc;
  }, {} as any);
}

/* ================= Codegen: Entity (Isar) ================= */

function generateIsarEntity(className: string, formattedName: string, fields: any): string {
  const entityFields = Object.keys(fields)
    .map((key) => `  ${inferType(fields[key], toPascalCase(key))} ${key};`)
    .join('\n');

  const ctorParams = Object.keys(fields)
    .map((key) => `    this.${key},`)
    .join('\n');

  const fromMapBody = Object.keys(fields)
    .map((key) => `      ${key}: ${fromMapExpr(key, fields[key], toPascalCase(key))},`)
    .join('\n');

  const toMapBody = Object.keys(fields)
    .map((key) => `      '${key}': ${toMapExpr(key, fields[key], toPascalCase(key))},`)
    .join('\n');

  const emptyBody = Object.keys(fields)
    .map((key) => `      ${key}: ${getDefaultValue(fields[key], key)},`)
    .join('\n');

  const embedded = generateEmbeddedClasses(fields);

  return `
import 'package:isar/isar.dart';

part '${formattedName}_entity.g.dart';

@collection
class ${className} {
  Id identification = Isar.autoIncrement;

${entityFields}

  ${className}({
${ctorParams}
  });

  factory ${className}.fromMap(Map<String, dynamic> json) => ${className}(
${fromMapBody}
  );

  Map<String, dynamic> toMap() => {
${toMapBody}
  };

  factory ${className}.empty() => ${className}(
${emptyBody}
  );
}

${embedded}
`;
}

function generateEmbeddedClasses(obj: any): string {
  let out = '';
  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // Array<obj>
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      const sample = val.length > 1 ? mergeObjects(val) : val[0];
      const cls = toPascalCase(key) + 'Entity';
      out += embeddedClass(cls, sample);
      out += generateEmbeddedClasses(sample);
    }

    // nested obj
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const cls = toPascalCase(key) + 'Entity';
      out += embeddedClass(cls, val);
      out += generateEmbeddedClasses(val);
    }
  }
  return out;
}

function embeddedClass(className: string, sample: any): string {
  const fieldsStr = Object.keys(sample)
    .map((k) => `  ${inferType(sample[k], toPascalCase(k))} ${k};`)
    .join('\n');

  const ctor = Object.keys(sample)
    .map((k) => `    this.${k},`)
    .join('\n');

  const fromMapBody = Object.keys(sample)
    .map((k) => `      ${k}: ${fromMapExpr(k, sample[k], toPascalCase(k))},`)
    .join('\n');

  const toMapBody = Object.keys(sample)
    .map((k) => `      '${k}': ${toMapExpr(k, sample[k], toPascalCase(k))},`)
    .join('\n');

  const emptyBody = Object.keys(sample)
    .map((k) => `      ${k}: ${getDefaultValue(sample[k], k)},`)
    .join('\n');

  return `
@embedded
class ${className} {
${fieldsStr}

  ${className}({
${ctor}
  });

  factory ${className}.fromMap(Map<String, dynamic> json) => ${className}(
${fromMapBody}
  );

  Map<String, dynamic> toMap() => {
${toMapBody}
  };

  factory ${className}.empty() => ${className}(
${emptyBody}
  );
}
`;
}

/* ================= Codegen: Model (extends Entity) ================= */

function generateModelClass(baseClassName: string, formattedName: string, fields: any): string {
  const superParams = Object.keys(fields)
    .map((key) => `    required super.${key},`)
    .join('\n');

  const copyParams = Object.keys(fields)
    .map((key) => `      ${key}: e.${key},`)
    .join('\n');

  return `import '../../entities/${formattedName}_entity.dart';

class ${baseClassName}Model extends ${baseClassName}Entity {
  ${baseClassName}Model({
${superParams}
  });

  /// JSON -> Model
  factory ${baseClassName}Model.fromMap(Map<String, dynamic> json) {
    final e = ${baseClassName}Entity.fromMap(json);
    return ${baseClassName}Model(
${copyParams}
    );
  }

  /// Model -> JSON
  @override
  Map<String, dynamic> toMap() => super.toMap();

  /// Model -> Entity (نسخة جديدة)
  ${baseClassName}Entity toEntity() => ${baseClassName}Entity.fromMap(toMap());

  /// Entity -> Model
  static ${baseClassName}Model fromEntity(${baseClassName}Entity e) =>
      ${baseClassName}Model.fromMap(e.toMap());
}
`;
}

/* ================= Codegen: Mappers (Extensions) ================= */

function generateMapperFile(base: string, formatted: string): string {
  return `import '../entities/${formatted}_entity.dart';
import '../models/${formatted}_model.dart';

extension ${base}EntityToModelX on ${base}Entity {
  ${base}Model toModel() => ${base}Model.fromMap(toMap());
}

extension ${base}ModelToEntityX on ${base}Model {
  ${base}Entity toEntity() => ${base}Entity.fromMap(toMap());
}

extension ${base}EntityListMapX on List<${base}Entity> {
  List<${base}Model> toModels() => map((e) => e.toModel()).toList();
}

extension ${base}ModelListMapX on List<${base}Model> {
  List<${base}Entity> toEntities() => map((e) => e.toEntity()).toList();
}
`;
}

/* ================= Type & Mapping helpers ================= */

function inferType(value: any, parentClassName: string): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'int?' : 'double?';
  if (typeof value === 'string') return 'String?';
  if (typeof value === 'boolean') return 'bool?';

  if (Array.isArray(value)) {
    if (value.length > 0) {
      if (typeof value[0] === 'object' && value[0] !== null) {
        const t = toPascalCase(parentClassName) + 'Entity';
        return `List<${t}>?`;
      } else {
        const item = inferType(value[0], parentClassName).replace('?', '');
        return `List<${item}>?`;
      }
    }
    return 'List<dynamic>?';
  }

  if (typeof value === 'object' && value !== null) {
    return toPascalCase(parentClassName) + 'Entity?';
  }

  return 'dynamic';
}

function getDefaultValue(value: any, key: string): string {
  if (typeof value === 'number') return '0';
  if (typeof value === 'string') return "''";
  if (typeof value === 'boolean') return 'false';
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object' && value !== null) {
    const cls = toPascalCase(key) + 'Entity';
    return `${cls}()`;
  }
  return 'null';
}

function fromMapExpr(key: string, value: any, parent: string): string {
  if (typeof value === 'number')
    return `(json['${key}'] as num?)${Number.isInteger(value) ? '?.toInt()' : '?.toDouble()'}`;
  if (typeof value === 'string') return `json['${key}'] as String?`;
  if (typeof value === 'boolean') return `json['${key}'] as bool?`;

  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const cls = toPascalCase(parent) + 'Entity';
      return `(json['${key}'] as List?)?.map((e) => ${cls}.fromMap(Map<String, dynamic>.from(e as Map))).toList()`;
    } else if (value.length > 0) {
      return `(json['${key}'] as List?)?.map((e) => e).toList()`;
    }
    return `(json['${key}'] as List?)?.toList()`;
  }

  if (typeof value === 'object' && value !== null) {
    const cls = toPascalCase(parent) + 'Entity';
    return `(json['${key}'] != null ? ${cls}.fromMap(Map<String, dynamic>.from(json['${key}'] as Map)) : null)`;
    }

  return `json['${key}']`;
}

function toMapExpr(key: string, value: any, parent: string): string {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      return `${key}?.map((e) => e.toMap()).toList()`;
    }
    return key;
  }
  if (typeof value === 'object' && value !== null) {
    return `${key}?.toMap()`;
  }
  return key;
}
