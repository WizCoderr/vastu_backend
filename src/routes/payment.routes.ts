import { Router } from 'express';
import { requireAuth } from '../core/authMiddleware';
import { PaymentIntent } from '../payment/payment.intent';
import express from 'express';

const router = Router();

router.post('/create-intent', requireAuth, PaymentIntent.createIntent);

// Webhook needs raw body, usually handled in app.ts or specific middleware wrapper
// Here we assume global middleware might interfere, so we might need `express.raw({type: 'application/json'})` 
// but often it's handled at top level for specific path.
router.post('/webhook', PaymentIntent.webhook);

export default router;
