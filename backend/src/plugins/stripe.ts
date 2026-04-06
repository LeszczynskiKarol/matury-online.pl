import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import Stripe from "stripe";

declare module "fastify" {
  interface FastifyInstance {
    stripe: Stripe;
  }
}

const stripePlugin: FastifyPluginAsync = async (app) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
  });

  app.decorate("stripe", stripe);
  app.log.info("✅ Stripe initialized");
};

export default fp(stripePlugin, { name: "stripe" });
export { stripePlugin };
