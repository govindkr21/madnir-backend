const Template = require("../Models/TemplateModel");
const { asyncHandler } = require("../Utils/AsyncHandler");

const listTemplates = asyncHandler(async (req, res) => {
  const orgId = req.orgId;
  const doctorId = req.doctor?.id;

  const filter = {
    organization: orgId,
    $or: [{ shared: true }, { doctor: doctorId || null }],
  };
  if (req.query.search) {
    const re = new RegExp(String(req.query.search).trim(), "i");
    filter.$and = [{ $or: filter.$or }, { $or: [{ name: re }, { diagnosis: re }] }];
    delete filter.$or;
  }

  const result = await Template.paginate(filter, {
    page: Number(req.query.page || 1),
    limit: Math.min(100, Number(req.query.limit || 30)),
    sort: { usageCount: -1, updatedAt: -1 },
    populate: { path: "doctor", select: "name specialization" },
  });

  res.status(200).json(result);
});

const getTemplate = asyncHandler(async (req, res) => {
  const tpl = await Template.findOne({ _id: req.params.templateId, organization: req.orgId });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  res.status(200).json({ template: tpl });
});

const createTemplate = asyncHandler(async (req, res) => {
  const { name, diagnosis, symptoms, medicines, advice, notes, shared } = req.body || {};
  if (!name) return res.status(400).json({ message: "name is required." });
  if (!Array.isArray(medicines) || medicines.length === 0)
    return res.status(400).json({ message: "At least one medicine is required." });

  const tpl = await Template.create({
    organization: req.orgId,
    doctor: req.doctor?.id || null,
    name,
    diagnosis: diagnosis || "",
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    medicines,
    advice: advice || "",
    notes: notes || "",
    shared: !!shared,
  });

  res.status(201).json({ message: "Template created.", template: tpl });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const tpl = await Template.findOne({ _id: req.params.templateId, organization: req.orgId });
  if (!tpl) return res.status(404).json({ message: "Template not found." });

  if (req.doctor?.orgRole !== "owner" && tpl.doctor && String(tpl.doctor) !== String(req.doctor?.id))
    return res.status(403).json({ message: "You can only edit your own templates." });

  const fields = ["name", "diagnosis", "symptoms", "medicines", "advice", "notes", "shared"];
  for (const f of fields) if (req.body[f] !== undefined) tpl[f] = req.body[f];
  await tpl.save();

  res.status(200).json({ message: "Template updated.", template: tpl });
});

const useTemplate = asyncHandler(async (req, res) => {
  const tpl = await Template.findOne({ _id: req.params.templateId, organization: req.orgId });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  tpl.usageCount = (tpl.usageCount || 0) + 1;
  await tpl.save();
  res.status(200).json({ template: tpl });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const tpl = await Template.findOne({ _id: req.params.templateId, organization: req.orgId });
  if (!tpl) return res.status(404).json({ message: "Template not found." });
  if (req.doctor?.orgRole !== "owner" && tpl.doctor && String(tpl.doctor) !== String(req.doctor?.id))
    return res.status(403).json({ message: "You can only delete your own templates." });
  await tpl.deleteOne();
  res.status(200).json({ message: "Template deleted." });
});

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  useTemplate,
  deleteTemplate,
};
