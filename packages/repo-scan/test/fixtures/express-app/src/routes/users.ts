import { Router } from "express";

const router = Router();

router.get("/users", (_req, res) => {
	res.json([]);
});

export default router;
