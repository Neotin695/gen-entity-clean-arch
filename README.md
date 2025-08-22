# Gen Entity Clean Arch — VS Code Extension

**Gen Entity Clean Arch** هي إضافة لـ **VS Code** تولِّد لك ملفات **Entities** و **Models** (وفق نمط Clean Architecture) مباشرةً من **JSON**، مع دعم قاعدة البيانات **Isar** بدل Hive، وإضافة ملف **Mappers** للتحويل بين الكيانات والموديلات (toModel / fromModel) — بدون أي حِزم Mapping إضافية.

> ✅ الإضافة تولِّد ثلاثة ملفات لكل كيان:  
> 1) `*_entity.dart` (Isar @collection + @embedded)  
> 2) `*_model.dart` (يرث من الـ Entity ويحتوي fromMap/toMap)  
> 3) `*_mappers.dart` (Extensions: toModel / toEntity + تحويل القوائم)

---

## ✨ المزايا

- إدخال **JSON/JSON5** حرّ (تلقّي نص أو سطور مفتاحية) — مع Normalization ذكي.
- توليد **Isar Entities** بعلامات: `@collection` للكيان الأساسي، و`@embedded` للمتداخلة.
- توليد **Model** يرث من **Entity** (ويورِّث الأساليب) — مناسب لمشروعات **Clean Architecture** التي تفضّل الوراثة.
- توليد **Mappers** كـ **Extensions**:  
  - `Entity.toModel()`، `Model.toEntity()`، وتحويل القوائم.
- دعم القوائم المتداخلة والكائنات المتداخلة.
- حقول **Nullable** افتراضيًا (مرونة أعلى مع JSON غير مكتمل).
- لا يعتمد على Freezed/Json Serializable/Hive/AutoMapper.

---

## 🧰 المتطلبات

- **Flutter** (Dart 3+).
- في مشروع Flutter: إعداد **Isar** و Codegen.

أضف إلى `pubspec.yaml` في مشروعك:

```yaml
dependencies:
  isar: ^3.1.0+1
  isar_flutter_libs: ^3.1.0+1
  path_provider: ^2.1.4

dev_dependencies:
  build_runner: ^2.4.11
  isar_generator: ^3.1.0+1
```

بعد توليد الملفات، شغّل:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

> **مهم:** كل ملف Entity يحتوي `part '<name>_entity.g.dart';` ويجب تشغيل الـcodegen بعد الإنشاء.

---

## 🧩 التثبيت

- من داخل VS Code: `Ctrl/Cmd + Shift + P` → **Extensions: Install from VSIX** (لو عندك ملف VSIX)  
  أو ابحث عن **gen entity clean arch** في Marketplace إن كان منشورًا.
- بعد التثبيت، أعد تشغيل VS Code (إن لزم).

---

## 🚀 كيف تستخدمها

1. افتح مشروع Flutter.
2. من **Command Palette** (`Ctrl/Cmd + Shift + P`) اكتب: **gen entity clean arch** ثم اختر الأمر.
3. أدخل **اسم الكلاس** (مثال: `BuildingEntity` أو `Building`). سيُحسب الاسم الأساسي تلقائيًا.
4. ألصق **JSON** الخاص بالحقل/الكيان (تُقبل JSON/JSON5 أو سطور `key: value`).
5. اختر مجلد حفظ **Entities** ثم مجلد حفظ **Models**.
6. ستحصل على:  
   - `building_entity.dart`  
   - `building_model.dart`  
   - `building_mappers.dart`
7. شغّل الـ codegen لمشروعك (انظر قسم المتطلبات).

---

## 📝 قواعد إدخال JSON

- مقبول: **Object** أو **Array of Objects** (سيتم دمج الحقول تلقائيًا عند الجذر).
- القيم البدائية تتحول لأنواع Dart (`int/double/String/bool`).  
- القوائم:  
  - `List<T>` للبدائيات أو `List<SomeEntity>` للأجسام المتداخلة.  
- الكائنات المتداخلة تتحول إلى **@embedded** Entities.
- جميع الحقول **Nullable** بشكل افتراضي (تستوعب الـ JSON الناقص).
- إن تعارضت أنواع نفس المفتاح في مدخلات مختلفة، سيُضبط إلى `dynamic` (أو nullable).

> مثال إدخال سريع:
```json
{
  "title": "عمارة الضياء",
  "rating": 4.5,
  "owner": {"ownerId": 7, "name": "Ali"},
  "tags": ["near_haram","family"],
  "units": [{"beds": 3, "monthlyPrice": 2200.0}]
}
```

---

## 📦 ماذا يتم توليده؟

### 1) الكيان — `building_entity.dart`
```dart
import 'package:isar/isar.dart';

part 'building_entity.g.dart';

@collection
class BuildingEntity {
  Id id = Isar.autoIncrement;

  String? title;
  double? rating;
  OwnerEntity? owner;
  List<String>? tags;
  List<UnitEntity>? units;

  BuildingEntity({
    this.title,
    this.rating,
    this.owner,
    this.tags,
    this.units,
  });

  factory BuildingEntity.fromMap(Map<String, dynamic> json) => BuildingEntity(
        title: json['title'] as String?,
        rating: (json['rating'] as num?)?.toDouble(),
        owner: (json['owner'] != null
            ? OwnerEntity.fromMap(Map<String, dynamic>.from(json['owner'] as Map))
            : null),
        tags: (json['tags'] as List?)?.map((e) => e).toList(),
        units: (json['units'] as List?)
            ?.map((e) => UnitEntity.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );

  Map<String, dynamic> toMap() => {
        'title': title,
        'rating': rating,
        'owner': owner?.toMap(),
        'tags': tags,
        'units': units?.map((e) => e.toMap()).toList(),
      };

  factory BuildingEntity.empty() => BuildingEntity(
        title: '',
        rating: 0,
        owner: OwnerEntity(),
        tags: const [],
        units: const [],
      );
}

@embedded
class OwnerEntity {
  int? ownerId;
  String? name;

  OwnerEntity({this.ownerId, this.name});

  factory OwnerEntity.fromMap(Map<String, dynamic> json) => OwnerEntity(
        ownerId: (json['ownerId'] as num?)?.toInt(),
        name: json['name'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'ownerId': ownerId,
        'name': name,
      };
}

@embedded
class UnitEntity {
  int? beds;
  double? monthlyPrice;

  UnitEntity({this.beds, this.monthlyPrice});

  factory UnitEntity.fromMap(Map<String, dynamic> json) => UnitEntity(
        beds: (json['beds'] as num?)?.toInt(),
        monthlyPrice: (json['monthlyPrice'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toMap() => {
    'beds': beds,
    'monthlyPrice': monthlyPrice,
  };
}
```

### 2) الموديل — `building_model.dart` (يرث من الـ Entity)
```dart
import '../../entities/building_entity.dart';

class BuildingModel extends BuildingEntity {
  BuildingModel({
    required super.title,
    required super.rating,
    required super.owner,
    required super.tags,
    required super.units,
  });

  factory BuildingModel.fromMap(Map<String, dynamic> json) {
    final e = BuildingEntity.fromMap(json);
    return BuildingModel(
      title: e.title,
      rating: e.rating,
      owner: e.owner,
      tags: e.tags,
      units: e.units,
    );
  }

  @override
  Map<String, dynamic> toMap() => super.toMap();

  BuildingEntity toEntity() => BuildingEntity.fromMap(toMap());

  static BuildingModel fromEntity(BuildingEntity e) => BuildingModel.fromMap(e.toMap());
}
```

### 3) المابرز — `building_mappers.dart`
```dart
import '../entities/building_entity.dart';
import '../models/building_model.dart';

extension BuildingEntityToModelX on BuildingEntity {
  BuildingModel toModel() => BuildingModel.fromMap(toMap());
}

extension BuildingModelToEntityX on BuildingModel {
  BuildingEntity toEntity() => BuildingEntity.fromMap(toMap());
}

extension BuildingEntityListMapX on List<BuildingEntity> {
  List<BuildingModel> toModels() => map((e) => e.toModel()).toList();
}

extension BuildingModelListMapX on List<BuildingModel> {
  List<BuildingEntity> toEntities() => map((e) => e.toEntity()).toList();
}
```

---

## 🛠️ Troubleshooting

- **`part '*.g.dart'` مفقود**: شغّل `build_runner` بعد التوليد.
- **أخطاء JSON**: استخدم JSON صحيح أو JSON5؛ الإضافة تقوم بعمل Normalize تلقائي.
- **Imports متداخلة**: حافظ على اتجاه الاستيراد (Model يستورد Entity فقط).

---

## 📄 License

MIT (أو ضع الترخيص الذي تفضّله).
