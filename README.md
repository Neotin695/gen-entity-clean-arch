Here's a **README.md** file for the VS Code extension that generates Dart entities and models using **Clean Architecture**:

```markdown
# 📌 Gen Entity Clean Arch

**Gen Entity Clean Arch** is a VS Code extension designed to help developers generate **Entities** and **Models** following the principles of **Clean Architecture** in **Flutter**.

---

## 🚀 **Installation**

### **1️⃣ Install the Extension**
You can install the extension directly from the **VS Code Marketplace** by searching for:
```sh
Gen Entity Clean Arch
```
Or you can manually install it using `vsce`:
```sh
code --install-extension gen-entity-clean-arch
```

---

## 🛠 **How to Use**

### **1️⃣ Generate a New Entity**
1. Open **VS Code** within your **Flutter** project.
2. Right-click on the `lib/domain/entities/` folder.
3. Choose **Generate Entity**.
4. Enter the name for the **Entity** (e.g., `CarEntity`).
5. The extension will automatically generate a new **Entity** with appropriate fields based on the entered **JSON** structure.

### **2️⃣ Install dependces **
```pubspec

dependencies:
  flutter:
    sdk: flutter
  equatable: ^2.0.5
  json_annotation: ^4.9.0
  freezed_annotation: ^2.4.4
  auto_mappr_annotation: ^1.2.0
  hive_flutter: ^1.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter


  build_runner: ^2.4.13
  auto_route_generator: ^9.0.0
  json_serializable: ^6.8.0
  build_test: ^2.2.2
  build_web_compilers: ^4.0.11
  freezed: ^2.5.7
  auto_mappr: ^1.7.0
  hive_generator: ^2.0.1


```

### **2️⃣ Generate a New Model**
1. Navigate to the `lib/data/models/` folder.
2. Right-click the folder and choose **Generate Model**.
3. Enter the name for the **Model** (e.g., `CarModel`).
4. The extension will automatically generate a new **Model** with `fromJson()` and `toJson()` methods.

---

## 📌 **How It Works**

### **1. Entering the Model Name**
You will be prompted to enter the **Model class name** (e.g., `CarEntity`). If the name includes `Entity`, it will be removed automatically, and the extension will append it again to ensure the correct naming convention.

### **2. Providing the JSON Structure**
The extension will ask you for the **JSON structure** for the model fields. The fields will be used to generate the Entity and Model with the correct types and annotations.

### **3. Choosing the Save Location**
Afterward, you will be prompted to choose the directory where you want to save the **Entity** and **Model** files.

---

## 📌 **Example Output**

After running the extension, you will get an **Entity** like this:

```dart
@HiveType(typeId: 62)
@AutoMappr([
  MapType<SponsorsModel, SponsorsEntity>(),
])
class SponsorsEntity extends $SponsorsEntity {
  @HiveField(0)
  final String uuid;

  @HiveField(1)
  final String image;

  @HiveField(2)
  final String end_date;

  SponsorsEntity({
    required this.uuid,
    required this.image,
    required this.end_date,
  });

  factory SponsorsEntity.fromModel(SponsorsModel model) =>
      const $SponsorsEntity().convert<SponsorsModel, SponsorsEntity>(model);

  factory SponsorsEntity.empty() =>
      SponsorsEntity(uuid: '', image: '', end_date: '');
}
```

And a corresponding **Model** like this:

```dart
part 'sponsors_model.g.dart';

@JsonSerializable()
class SponsorsModel extends SponsorsEntity {
  SponsorsModel(
      {required super.uuid, required super.image, required super.end_date});

  factory SponsorsModel.fromJson(Map<String, dynamic> json) =>
      _$SponsorsModelFromJson(json);

  Map<String, dynamic> toMap() => _$SponsorsModelToJson(this);
}

```

---

## 🔥 **Benefits**
- ✅ **Saves time** by automatically generating code.
- ✅ **Compliant with Clean Architecture** principles.
- ✅ **Reduces coding errors** and ensures consistent code structure.

---

## 💡 **Contributing & Development**
- You can contribute to improving the extension by submitting a PR on our GitHub repository.
- Have suggestions or issues? Open an `Issue` on GitHub!

---

## ⚖️ **License**
This extension is licensed under the **MIT License**, meaning you can freely use it in your projects.

---

🚀 **Start now and make your development process faster and more organized!**
```

This README file provides a detailed explanation of how to install and use the extension, along with benefits and an example of the generated code. If you need any further adjustments, feel free to ask!
