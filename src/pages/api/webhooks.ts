import { NextApiRequest, NextApiResponse } from "../../../node_modules/next/dist/shared/lib/utils";
import { Readable } from 'stream'
import { Stripe } from "stripe";
import { stripe } from "../../services/stripe";
import { saveSubscription } from "./_lib/manageSubscription";

async function buffer(readable: Readable) {
    const chunks = [];

    for await (const chunk of readable) {
        chunks.push(
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        )
    }

    return Buffer.concat(chunks)
}

export const config = {
    api: {
        bodyParser: false
    }
}

const relevantEvents = new Set([
    'checkout.session.completed'
])

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const buf = await buffer(req)
        const secret = req.headers['stripe-signature']

        let event: Stripe.event;

        try {
            event = stripe.webhooks.constructEvent(buf, secret, process.env.STRIPE_WEBHOOK_SECRET)
        } catch (error) {
            return res.status(400).send(`Webhook error: ${error.message}`)
        }

        const { type } = event

        console.log('typeee', type);
        console.log('relevantEvents', relevantEvents);

        if (relevantEvents.has(type)) {
            try {
                switch (type) {
                    case 'checkout.session.completed':
                        const checkoutSession = event.data.object as Stripe.Checkout.Session

                        await saveSubscription(
                            checkoutSession.subscription.toString(),
                            checkoutSession.customer.toString()
                        )
                        break;
                    default:
                        throw new Error("Unhadled event");
                }
            } catch (error) {
                return res.json({ error: 'webhook handler failed' })
            }
        }

        return res.status(200).json({ received: true })
    } else {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method not allowed')
    }

}