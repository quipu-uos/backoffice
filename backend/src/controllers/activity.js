const mongoose = require("mongoose");
const ActivityType = require("../models/ActivityType");
const ActivityItem = require("../models/ActivityItem");
const { FieldTypeValues } = require("../models/ActivityType");

const FIELD_TYPES = new Set(FieldTypeValues);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isBlank = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const normalizeOrder = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeBoolean = (value, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

const validateKey = (value, name) => {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    return `${name}는 영문자로 시작하고 영문/숫자/_/-만 사용할 수 있습니다.`;
  }
  return null;
};

const validateImageValue = (value) => {
  if (typeof value === "string") return value.trim() !== "";
  return isPlainObject(value) && typeof value.url === "string" && value.url.trim() !== "";
};

const validateFieldValue = (field, value) => {
  if (isBlank(value)) return true;

  switch (field.inputType) {
    case "shortText":
    case "longText":
    case "date":
    case "url":
      return typeof value === "string";
    case "dateRange":
      return (
        typeof value === "string" ||
        (isPlainObject(value) &&
          typeof value.startDate === "string" &&
          typeof value.endDate === "string")
      );
    case "image":
      return validateImageValue(value);
    case "imageList":
      return Array.isArray(value) && value.every(validateImageValue);
    case "icon":
      return (
        typeof value === "string" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"))
      );
    default:
      return false;
  }
};

const validateFields = (fields) => {
  if (!Array.isArray(fields)) {
    return "fields는 배열이어야 합니다.";
  }

  const ids = new Set();
  for (const [index, field] of fields.entries()) {
    if (!isPlainObject(field)) {
      return `fields[${index}]는 객체여야 합니다.`;
    }

    const fieldIdError = validateKey(field.fieldId, `fields[${index}].fieldId`);
    if (fieldIdError) return fieldIdError;

    if (ids.has(field.fieldId)) {
      return `중복된 fieldId입니다: ${field.fieldId}`;
    }
    ids.add(field.fieldId);

    if (typeof field.label !== "string" || field.label.trim() === "") {
      return `fields[${index}].label은 필수입니다.`;
    }

    if (!FIELD_TYPES.has(field.inputType)) {
      return `지원하지 않는 inputType입니다: ${field.inputType}`;
    }

    if (typeof field.required !== "boolean") {
      return `fields[${index}].required는 boolean이어야 합니다.`;
    }

    if (!Number.isInteger(Number(field.order)) || Number(field.order) < 0) {
      return `fields[${index}].order는 0 이상의 정수여야 합니다.`;
    }

    if (field.fileConfig !== undefined) {
      if (!["image", "imageList"].includes(field.inputType)) {
        return "fileConfig는 image 또는 imageList 타입에만 사용할 수 있습니다.";
      }

      if (!isPlainObject(field.fileConfig)) {
        return `fields[${index}].fileConfig는 객체여야 합니다.`;
      }

      const { maxFiles, maxSizeMB } = field.fileConfig;
      if (maxFiles !== undefined && (!Number.isInteger(Number(maxFiles)) || Number(maxFiles) < 1)) {
        return `fields[${index}].fileConfig.maxFiles는 1 이상의 정수여야 합니다.`;
      }
      if (maxSizeMB !== undefined && (!Number.isFinite(Number(maxSizeMB)) || Number(maxSizeMB) <= 0)) {
        return `fields[${index}].fileConfig.maxSizeMB는 0보다 큰 숫자여야 합니다.`;
      }
    }
  }

  return null;
};

const normalizeFields = (fields) =>
  [...fields]
    .map((field) => ({
      fieldId: field.fieldId,
      label: field.label.trim(),
      inputType: field.inputType,
      required: field.required,
      order: normalizeOrder(field.order),
      ...(field.fileConfig
        ? {
            fileConfig: {
              ...(field.fileConfig.maxFiles !== undefined
                ? { maxFiles: Number(field.fileConfig.maxFiles) }
                : {}),
              ...(field.fileConfig.maxSizeMB !== undefined
                ? { maxSizeMB: Number(field.fileConfig.maxSizeMB) }
                : {}),
            },
          }
        : {}),
    }))
    .sort((a, b) => a.order - b.order);

const validateData = (data, fields) => {
  if (!isPlainObject(data)) {
    return "data는 객체여야 합니다.";
  }

  const fieldMap = new Map(fields.map((field) => [field.fieldId, field]));
  for (const key of Object.keys(data)) {
    if (!fieldMap.has(key)) {
      return `정의되지 않은 fieldId가 data에 포함되어 있습니다: ${key}`;
    }
  }

  for (const field of fields) {
    const value = data[field.fieldId];
    if (field.required && isBlank(value)) {
      return `필수 필드가 누락되었습니다: ${field.fieldId}`;
    }

    if (!validateFieldValue(field, value)) {
      return `필드 타입과 data 값이 일치하지 않습니다: ${field.fieldId}`;
    }

    if (field.inputType === "imageList" && field.fileConfig?.maxFiles && Array.isArray(value)) {
      if (value.length > field.fileConfig.maxFiles) {
        return `${field.fieldId}는 최대 ${field.fileConfig.maxFiles}개까지 업로드할 수 있습니다.`;
      }
    }
  }

  return null;
};

const serializeActivityType = (activityType) => ({
  _id: activityType._id,
  typeId: activityType.typeId,
  displayName: activityType.displayName,
  description: activityType.description,
  order: activityType.order,
  isActive: activityType.isActive,
  fields: activityType.fields || [],
  createdAt: activityType.createdAt,
  updatedAt: activityType.updatedAt,
});

const serializeActivityItem = (activityItem) => ({
  _id: activityItem._id,
  typeKey: activityItem.typeKey,
  order: activityItem.order,
  isVisible: activityItem.isVisible,
  data: activityItem.data || {},
  createdAt: activityItem.createdAt,
  updatedAt: activityItem.updatedAt,
});

const findActivityType = (id) => {
  if (isObjectId(id)) return ActivityType.findById(id);
  return ActivityType.findOne({ typeId: id });
};

const createActivityType = async (req, res) => {
  try {
    const { typeId, displayName, description, order, isActive, fields = [] } = req.body;

    const typeIdError = validateKey(typeId, "typeId");
    if (typeIdError) return res.status(400).json({ message: typeIdError });

    if (typeof displayName !== "string" || displayName.trim() === "") {
      return res.status(400).json({ message: "displayName은 필수입니다." });
    }

    const fieldsError = validateFields(fields);
    if (fieldsError) return res.status(400).json({ message: fieldsError });

    const activityType = await ActivityType.create({
      typeId,
      displayName: displayName.trim(),
      description: description || undefined,
      order: normalizeOrder(order),
      isActive: normalizeBoolean(isActive, true),
      fields: normalizeFields(fields),
    });

    return res.status(201).json(serializeActivityType(activityType));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "이미 존재하는 typeId입니다." });
    }
    console.error("[ERROR] createActivityType:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const getActivityTypes = async (req, res) => {
  try {
    const query = {};
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const activityTypes = await ActivityType.find(query).sort({ order: 1, createdAt: 1 });

    return res.status(200).json({ items: activityTypes.map(serializeActivityType) });
  } catch (err) {
    console.error("[ERROR] getActivityTypes:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const updateActivityType = async (req, res) => {
  try {
    const activityType = await findActivityType(req.params.id);
    if (!activityType) {
      return res.status(404).json({ message: "ActivityType을 찾을 수 없습니다." });
    }

    const { displayName, description, order, isActive, fields } = req.body;

    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim() === "") {
        return res.status(400).json({ message: "displayName은 빈 값일 수 없습니다." });
      }
      activityType.displayName = displayName.trim();
    }

    if (description !== undefined) activityType.description = description || undefined;
    if (order !== undefined) activityType.order = normalizeOrder(order, activityType.order);
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive는 boolean이어야 합니다." });
      }
      activityType.isActive = isActive;
    }

    if (fields !== undefined) {
      const fieldsError = validateFields(fields);
      if (fieldsError) return res.status(400).json({ message: fieldsError });
      activityType.fields = normalizeFields(fields);
    }

    await activityType.save();
    return res.status(200).json(serializeActivityType(activityType));
  } catch (err) {
    console.error("[ERROR] updateActivityType:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const updateActivityTypeOrder = async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ message: "items 배열이 필요합니다." });
  }

  try {
    const operations = [];

    for (const item of items) {
      const id = item._id ?? item.typeId;
      if (id === undefined || !Number.isInteger(Number(item.order)) || Number(item.order) < 0) {
        return res.status(400).json({ message: "각 item에는 _id/typeId와 order가 필요합니다." });
      }

      operations.push({
        updateOne: {
          filter: isObjectId(id) ? { _id: id } : { typeId: id },
          update: { $set: { order: Number(item.order) } },
        },
      });
    }

    if (operations.length > 0) {
      const result = await ActivityType.bulkWrite(operations);
      if (result.matchedCount !== operations.length) {
        return res.status(404).json({ message: "일부 ActivityType을 찾을 수 없습니다." });
      }
    }

    return res.status(200).json({ message: "ActivityType 순서가 변경되었습니다." });
  } catch (err) {
    console.error("[ERROR] updateActivityTypeOrder:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const createActivityItem = async (req, res) => {
  try {
    const typeKey = req.body.typeKey || req.body.typeId;
    const { order, isVisible, data = {} } = req.body;

    const typeKeyError = validateKey(typeKey, "typeKey");
    if (typeKeyError) return res.status(400).json({ message: typeKeyError });

    const activityType = await ActivityType.findOne({ typeId: typeKey });
    if (!activityType) {
      return res.status(404).json({ message: "ActivityType을 찾을 수 없습니다." });
    }

    const dataError = validateData(data, activityType.fields || []);
    if (dataError) return res.status(400).json({ message: dataError });

    const activityItem = await ActivityItem.create({
      typeKey,
      order: normalizeOrder(order),
      isVisible: normalizeBoolean(isVisible, true),
      data,
    });

    return res.status(201).json(serializeActivityItem(activityItem));
  } catch (err) {
    console.error("[ERROR] createActivityItem:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const getActivityItems = async (req, res) => {
  try {
    const { typeKey, typeId, isVisible } = req.query;
    const query = {};

    if (typeKey || typeId) query.typeKey = typeKey || typeId;
    if (isVisible !== undefined) query.isVisible = isVisible === "true";

    const activityItems = await ActivityItem.find(query).sort({
      typeKey: 1,
      order: 1,
      createdAt: 1,
    });

    return res.status(200).json({ items: activityItems.map(serializeActivityItem) });
  } catch (err) {
    console.error("[ERROR] getActivityItems:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const updateActivityItem = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "ActivityItem _id가 올바르지 않습니다." });
    }

    const activityItem = await ActivityItem.findById(req.params.id);
    if (!activityItem) {
      return res.status(404).json({ message: "ActivityItem을 찾을 수 없습니다." });
    }

    const nextTypeKey = req.body.typeKey || req.body.typeId || activityItem.typeKey;
    const typeKeyError = validateKey(nextTypeKey, "typeKey");
    if (typeKeyError) return res.status(400).json({ message: typeKeyError });

    const activityType = await ActivityType.findOne({ typeId: nextTypeKey });
    if (!activityType) {
      return res.status(404).json({ message: "ActivityType을 찾을 수 없습니다." });
    }

    if (req.body.typeKey !== undefined || req.body.typeId !== undefined) {
      activityItem.typeKey = nextTypeKey;
    }
    if (req.body.order !== undefined) {
      activityItem.order = normalizeOrder(req.body.order, activityItem.order);
    }
    if (req.body.isVisible !== undefined) {
      if (typeof req.body.isVisible !== "boolean") {
        return res.status(400).json({ message: "isVisible은 boolean이어야 합니다." });
      }
      activityItem.isVisible = req.body.isVisible;
    }

    if (req.body.data !== undefined) {
      const dataError = validateData(req.body.data, activityType.fields || []);
      if (dataError) return res.status(400).json({ message: dataError });
      activityItem.data = req.body.data;
    }

    await activityItem.save();
    return res.status(200).json(serializeActivityItem(activityItem));
  } catch (err) {
    console.error("[ERROR] updateActivityItem:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const updateActivityItemOrder = async (req, res) => {
  const { typeKey, typeId, items } = req.body;
  const targetTypeKey = typeKey || typeId;

  if (!targetTypeKey || !Array.isArray(items)) {
    return res.status(400).json({ message: "typeKey와 items 배열이 필요합니다." });
  }

  const typeKeyError = validateKey(targetTypeKey, "typeKey");
  if (typeKeyError) return res.status(400).json({ message: typeKeyError });

  try {
    const operations = [];

    for (const item of items) {
      const id = item._id;
      if (!isObjectId(id) || !Number.isInteger(Number(item.order)) || Number(item.order) < 0) {
        return res.status(400).json({ message: "각 item에는 올바른 _id와 order가 필요합니다." });
      }

      operations.push({
        updateOne: {
          filter: { _id: id, typeKey: targetTypeKey },
          update: { $set: { order: Number(item.order) } },
        },
      });
    }

    if (operations.length > 0) {
      const result = await ActivityItem.bulkWrite(operations);
      if (result.matchedCount !== operations.length) {
        return res.status(404).json({ message: "일부 ActivityItem을 찾을 수 없습니다." });
      }
    }

    return res.status(200).json({ message: "ActivityItem 순서가 변경되었습니다." });
  } catch (err) {
    console.error("[ERROR] updateActivityItemOrder:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

const deleteActivityItem = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "ActivityItem _id가 올바르지 않습니다." });
    }

    const deletedItem = await ActivityItem.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ message: "ActivityItem을 찾을 수 없습니다." });
    }

    return res.status(200).json({ message: "ActivityItem이 삭제되었습니다." });
  } catch (err) {
    console.error("[ERROR] deleteActivityItem:", err);
    return res.status(500).json({ message: "서버 오류 발생" });
  }
};

module.exports = {
  createActivityType,
  getActivityTypes,
  updateActivityType,
  updateActivityTypeOrder,
  createActivityItem,
  getActivityItems,
  updateActivityItem,
  updateActivityItemOrder,
  deleteActivityItem,
};
