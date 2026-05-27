// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';

type StorageKind = 'none' | 'isar' | 'hive';

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

        // 2) اختيارات التخزين المحلي + Nullable
        const storagePick = await vscode.window.showQuickPick(['None', 'Isar', 'Hive'], {
          placeHolder: 'Local storage support?',
        });
        if (!storagePick) return;
        const storageKind = storagePick.toLowerCase() as StorageKind;

        let hiveBaseTypeId = 0;
        if (storageKind === 'hive') {
          const typeIdStr = await vscode.window.showInputBox({
            placeHolder: 'Base Hive typeId (e.g., 100) — will auto-increment for nested classes',
            validateInput: (v) => (/^\d+$/.test(v) ? undefined : 'Enter a number (e.g., 100)'),
          });
          if (!typeIdStr) return;
          hiveBaseTypeId = parseInt(typeIdStr, 10);
        }

        const nullPick = await vscode.window.showQuickPick(
          ['Nullable fields', 'Non-nullable fields'],
          { placeHolder: 'Field nullability' }
        );
        if (!nullPick) return;
        const useNullable = nullPick.startsWith('Nullable');

        // 3) JSON/JSON5
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

        // 4) الجذر لازم يبقى Object أو Array<Object>
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

        // 5) أين تحفظ الملفات
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

        // 6) توليد الملفات
        const hiveTypeIdRef = { current: hiveBaseTypeId };

        const entityContent = generateEntity({
          className: entityClass,
          formattedName,
          fields,
          storageKind,
          useNullable,
          hiveTypeIdRef,
        });

        const modelContent = generateModelClass({
          baseClassName,
          formattedName,
          fields,
          useNullable,
        });

        const mapperContent = generateMapperFile(baseClassName, formattedName);

        await fs.promises.writeFile(entityFilePath, entityContent, 'utf-8');
        await fs.promises.writeFile(modelFilePath, modelContent, 'utf-8');
        await fs.promises.writeFile(mappersFilePath, mapperContent, 'utf-8');

        vscode.window.showInformationMessage(
          `Generated: ${entityFileName}, ${modelFileName}, ${mappersFileName}`
        );

        if (storageKind === 'isar') {
          vscode.window.showInformationMessage(
            'Isar enabled. Run build_runner to generate *.g.dart.'
          );
        } else if (storageKind === 'hive') {
          vscode.window.showInformationMessage(
            'Hive enabled. Add hive/hive_flutter + hive_generator (dev) then run build_runner.'
          );
        }
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

// للمقارنة في mergeObjects بدون تأثير الـ nullable
function inferBaseType(value: any, parentClassName: string): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'boolean') return 'bool';
  if (Array.isArray(value)) {
    if (value.length > 0) {
      if (typeof value[0] === 'object' && value[0] !== null) {
        const t = toPascalCase(parentClassName) + 'Entity';
        return `List<${t}>`;
      } else {
        const item = inferBaseType(value[0], parentClassName);
        return `List<${item}>`;
      }
    }
    return 'List<dynamic>';
  }
  if (typeof value === 'object' && value !== null) {
    return toPascalCase(parentClassName) + 'Entity';
  }
  return 'dynamic';
}

function mergeObjects(arr: any[]): any {
  return arr.reduce((acc, obj) => {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        if (!(key in acc)) {
          acc[key] = obj[key];
        } else {
          const t1 = inferBaseType(acc[key], toPascalCase(key));
          const t2 = inferBaseType(obj[key], toPascalCase(key));
          if (t1 !== t2) acc[key] = null;
        }
      });
    }
    return acc;
  }, {} as any);
}

/* ================= Codegen: Entity (Isar | Hive | Plain) ================= */

type GenEntityOpts = {
  className: string;
  formattedName: string;
  fields: any;
  storageKind: StorageKind;
  useNullable: boolean;
  hiveTypeIdRef?: { current: number };
};

function generateEntity(opts: GenEntityOpts): string {
  const { className, formattedName, fields, storageKind, useNullable, hiveTypeIdRef } = opts;

  const keys = Object.keys(fields);
  const entityFields = keys
    .map((key, idx) => fieldLine(key, fields[key], toPascalCase(key), useNullable, storageKind, idx))
    .join('\n');

  const ctorParams = keys
    .map((key) => `    ${useNullable ? '' : 'required '}this.${key},`)
    .join('\n');

  const fromMapBody = keys
    .map((key) => `      ${key}: ${fromMapExpr(key, fields[key], toPascalCase(key), useNullable)},`)
    .join('\n');

  const toMapBody = keys
    .map((key) => `      '${key}': ${toMapExpr(key, fields[key], toPascalCase(key))},`)
    .join('\n');

  const emptyBody = keys
    .map((key) => `      ${key}: ${getDefaultValue(fields[key], key, useNullable)},`)
    .join('\n');

  const propsList = [
    ...(storageKind === 'isar' ? ['identification'] : []),
    ...keys,
  ].join(', ');

  const embedded = generateEmbeddedClasses(fields, storageKind, useNullable, hiveTypeIdRef);

  // imports + parts
  let header = `import 'package:equatable/equatable.dart';\n`;
  if (storageKind === 'isar') {
    header += `import 'package:isar/isar.dart';\n\npart '${formattedName}_entity.g.dart';\n`;
  } else if (storageKind === 'hive') {
    header += `import 'package:hive/hive.dart';\n\npart '${formattedName}_entity.g.dart';\n`;
  }

  if (storageKind === 'isar') {
    return `
${header}

@collection
class ${className} extends Equatable {
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

  @override
  List<Object?> get props => [${propsList}];
}

${embedded}
`;
  } else if (storageKind === 'hive') {
    const typeId = hiveTypeIdRef ? hiveTypeIdRef.current++ : 0;
    return `
${header}

@HiveType(typeId: ${typeId})
class ${className} extends Equatable {
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

  @override
  List<Object?> get props => [${propsList}];
}

${embedded}
`;
  } else {
    // none
    return `
${header}

 class ${className} extends Equatable {
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

  @override
  List<Object?> get props => [${propsList}];
}

${embedded}
`;
  }
}

function fieldLine(
  key: string,
  value: any,
  parentClassName: string,
  useNullable: boolean,
  storageKind: StorageKind,
  indexForHive: number
): string {
  const type = inferType(value, parentClassName, useNullable);
  if (storageKind === 'isar') {
    return `  ${type} ${key};`;
  }
  if (storageKind === 'hive') {
    return `  @HiveField(${indexForHive})\n  ${type} ${key};`;
  }
  return `final  ${type} ${key};`;
}

function generateEmbeddedClasses(
  obj: any,
  storageKind: StorageKind,
  useNullable: boolean,
  hiveTypeIdRef?: { current: number }
): string {
  let out = '';
  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // Array<obj>
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      const sample = val.length > 1 ? mergeObjects(val) : val[0];
      const cls = toPascalCase(key) + 'Entity';
      out += embeddedClass(cls, sample, storageKind, useNullable, hiveTypeIdRef);
      out += generateEmbeddedClasses(sample, storageKind, useNullable, hiveTypeIdRef);
    }

    // nested obj
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const cls = toPascalCase(key) + 'Entity';
      out += embeddedClass(cls, val, storageKind, useNullable, hiveTypeIdRef);
      out += generateEmbeddedClasses(val, storageKind, useNullable, hiveTypeIdRef);
    }
  }
  return out;
}

function embeddedClass(
  className: string,
  sample: any,
  storageKind: StorageKind,
  useNullable: boolean,
  hiveTypeIdRef?: { current: number }
): string {
  const keys = Object.keys(sample);

  const fieldsStr = keys
    .map((k, idx) => fieldLine(k, sample[k], toPascalCase(k), useNullable, storageKind, idx))
    .join('\n');

  const ctor = keys
    .map((k) => `    ${useNullable ? '' : 'required '}this.${k},`)
    .join('\n');

  const fromMapBody = keys
    .map(
      (k) =>
        `      ${k}: ${fromMapExpr(k, sample[k], toPascalCase(k), useNullable)},`
    )
    .join('\n');

  const toMapBody = keys
    .map((k) => `      '${k}': ${toMapExpr(k, sample[k], toPascalCase(k))},`)
    .join('\n');

  const emptyBody = keys
    .map((k) => `      ${k}: ${getDefaultValue(sample[k], k, useNullable)},`)
    .join('\n');

  const propsList = keys.join(', ');

  let deco = '';
  if (storageKind === 'isar') deco = '@embedded\n';
  if (storageKind === 'hive') deco = `@HiveType(typeId: ${(hiveTypeIdRef ? hiveTypeIdRef.current++ : 0)})\n`;

  return `
${deco}class ${className} extends Equatable {
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

  @override
  List<Object?> get props => [${propsList}];
}
`;
}

/* ================= Codegen: Model (extends Entity) ================= */

type GenModelOpts = {
  baseClassName: string;
  formattedName: string;
  fields: any;
  useNullable: boolean;
};

function generateModelClass(opts: GenModelOpts): string {
  const { baseClassName, formattedName, fields, useNullable } = opts;

  const superParams = Object.keys(fields)
    .map((key) => `    ${useNullable ? '' : 'required '}super.${key},`)
    .join('\n');

  const copyParams = Object.keys(fields)
    .map((key) => `      ${key}: e.${key},`)
    .join('\n');

  return `import '../../domain/entities/${formattedName}_entity.dart';

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
  return `import '../domain/entities/${formatted}_entity.dart';
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

function inferType(value: any, parentClassName: string, useNullable: boolean): string {
  const q = useNullable ? '?' : '';
  if (typeof value === 'number') return Number.isInteger(value) ? `int${q}` : `double${q}`;
  if (typeof value === 'string') return `String${q}`;
  if (typeof value === 'boolean') return `bool${q}`;

  if (Array.isArray(value)) {
    if (value.length > 0) {
      if (typeof value[0] === 'object' && value[0] !== null) {
        const t = toPascalCase(parentClassName) + 'Entity';
        return `List<${t}>${q}`;
      } else {
        const item = inferType(value[0], parentClassName, false).replace('?', '');
        return `List<${item}>${q}`;
      }
    }
    return `List<dynamic>${q}`;
  }

  if (typeof value === 'object' && value !== null) {
    return toPascalCase(parentClassName) + `Entity${q}`;
  }

  return 'dynamic';
}

function getDefaultValue(value: any, key: string, useNullable: boolean): string {
  if (useNullable) return 'null';
  if (typeof value === 'number') return '0';
  if (typeof value === 'string') return "''";
  if (typeof value === 'boolean') return 'false';
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object' && value !== null) {
    const cls = toPascalCase(key) + 'Entity';
    return `${cls}.empty()`;
  }
  return 'null';
}

function fromMapExpr(
  key: string,
  value: any,
  parent: string,
  useNullable: boolean
): string {
  const orDefault = (d: string) => (useNullable ? '' : ` ?? ${d}`);

  if (typeof value === 'number') {
    const conv = Number.isInteger(value) ? '?.toInt()' : '?.toDouble()';
    const def = Number.isInteger(value) ? '0' : '0.0';
    return `(json['${key}'] as num?)${conv}${orDefault(def)}`;
  }
  if (typeof value === 'string') return `(json['${key}'] as String?)${orDefault("''")}`;
  if (typeof value === 'boolean') return `(json['${key}'] as bool?)${orDefault('false')}`;

  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const cls = toPascalCase(parent) + 'Entity';
      return `(json['${key}'] as List?)?.map((e) => ${cls}.fromMap(Map<String, dynamic>.from(e as Map))).toList()${orDefault('[]')}`;
    } else if (value.length > 0) {
      return `(json['${key}'] as List?)?.map((e) => e).toList()${orDefault('[]')}`;
    }
    return `(json['${key}'] as List?)?.toList()${orDefault('[]')}`;
  }

  if (typeof value === 'object' && value !== null) {
    const cls = toPascalCase(parent) + 'Entity';
    const fallback = useNullable ? 'null' : `${cls}.empty()`;
    return `(json['${key}'] != null ? ${cls}.fromMap(Map<String, dynamic>.from(json['${key}'] as Map)) : ${fallback})`;
  }

  return `json['${key}']${useNullable ? '' : ' ?? null'}`;
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
