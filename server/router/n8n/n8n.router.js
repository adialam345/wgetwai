import express from "express";
import ControllerApi from "../api/api.controller.js";

const router = express.Router();
const controller = new ControllerApi();

router.post("/send", controller.sendTextFromN8N.bind(controller));

export default router;

