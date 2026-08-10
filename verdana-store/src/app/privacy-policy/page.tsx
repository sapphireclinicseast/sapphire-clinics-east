import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: March 2026</p>

      <div className="mt-8 prose prose-gray max-w-none space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">1. Information We Collect</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            When you visit our store, we collect certain information about your device, your
            interaction with the store, and information necessary to process your purchases. We
            may also collect additional information if you contact us for customer support. This
            includes your name, email address, shipping address, payment information, and phone
            number.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">2. How We Use Your Information</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            We use the information we collect to fulfill orders and provide the services you
            request, process payments, communicate with you about products and promotions,
            improve our store and your shopping experience, and comply with legal obligations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">3. Cookies</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            We use cookies and similar tracking technologies to track activity on our store and
            hold certain information. Cookies are files with a small amount of data which may
            include an anonymous unique identifier. You can instruct your browser to refuse all
            cookies or to indicate when a cookie is being sent.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">4. Sharing Your Information</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            We share your personal information with third parties only to help us use your
            personal information as described above. For example, we use Stripe to process
            payments. We may also share your personal information to comply with applicable laws
            and regulations, to respond to a subpoena, search warrant, or other lawful request
            for information we receive, or to otherwise protect our rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">5. Your Rights</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            If you are a resident of the Philippines, you have the right to access the personal
            information we hold about you and to ask that your personal information be corrected,
            updated, or deleted. If you would like to exercise this right, please contact us
            through our Contact page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">6. Data Retention</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            When you place an order through the store, we will maintain your order information
            for our records unless and until you ask us to delete this information. We retain
            this data to fulfill orders, resolve disputes, and enforce our agreements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">7. Changes to This Policy</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            We may update this privacy policy from time to time in order to reflect changes to
            our practices or for other operational, legal, or regulatory reasons. We will notify
            you of any changes by posting the new policy on this page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-verdana-charcoal">8. Contact Us</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            For more information about our privacy practices, if you have questions, or if you
            would like to make a complaint, please contact us by email at
            verdanatrading@gmail.com or through our Contact page.
          </p>
        </section>
      </div>
    </div>
  )
}
