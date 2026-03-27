import type { Metadata } from "next"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export const metadata: Metadata = {
  title: "FAQs",
}

const faqs = [
  {
    question: "How long does shipping take?",
    answer:
      "We process orders within 1\u20132 business days. Delivery typically takes 3\u20137 business days depending on your location and chosen shipping method.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, AMEX) through our secure Stripe payment gateway.",
  },
  {
    question: "Are your products safe for children?",
    answer:
      "Yes! All our products are carefully curated by board-certified therapists and meet international safety standards for children\u2019s products.",
  },
  {
    question: "How do I clean and maintain the products?",
    answer:
      "Most of our sensory gel toys can be cleaned with mild soap and water. Specific care instructions are included with each product.",
  },
  {
    question: "Can I return or exchange an item?",
    answer:
      "We offer returns and exchanges within 7 days of delivery for unused items in original packaging. Please contact our support team.",
  },
  {
    question: "What should I do if a product arrives damaged?",
    answer:
      "Please take photos of the damaged item and packaging, then contact us within 48 hours of delivery. We\u2019ll arrange a replacement.",
  },
  {
    question: "How do I contact customer support?",
    answer:
      "You can reach us through our Contact page, email us at support@verdanarehab.com, or message us on Facebook.",
  },
]

export default function FAQsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">Frequently Asked Questions</h1>

      <Accordion type="single" collapsible className="mt-8 w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`faq-${index}`}>
            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">{faq.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
