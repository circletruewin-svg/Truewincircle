import React, { useState } from 'react';
import { ChevronDown, Mail, MessageCircle, Send } from 'lucide-react';
import useSocialLinks from '../hooks/useSocialLinks';

const FaqItem = ({ qEn, aEn, qHi, aHi, isOpen, onClick }) => (
  <div className="border-b border-white/10 last:border-b-0">
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-5 py-5 text-left transition-colors hover:bg-white/5"
    >
      <div>
        <p className="text-lg font-semibold text-white">{qEn}</p>
        <p className="mt-1 text-sm text-slate-300">{qHi}</p>
      </div>
      <ChevronDown
        className={`ml-4 h-5 w-5 flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
    {isOpen && (
      <div className="bg-slate-950/40 px-5 pb-5 text-slate-200">
        <p>{aEn}</p>
        <p className="mt-2 text-slate-300">{aHi}</p>
      </div>
    )}
  </div>
);

const Support = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const { links } = useSocialLinks();

  const faqs = [
    {
      qEn: 'How to deposit?',
      aEn: 'Open Add Cash, enter amount and payment note, pay with the shown QR, then upload the payment screenshot for admin approval.',
      qHi: 'डिपॉजिट कैसे करें?',
      aHi: 'Add Cash खोलें, amount aur payment note डालें, दिखाए गए QR se payment करें, फिर screenshot upload karke admin approval ka wait करें।',
    },
    {
      qEn: 'How to withdraw?',
      aEn: 'Withdrawal is available only from winning money. Enter the amount, add your UPI or bank details, and submit the request.',
      qHi: 'विड्रॉ कैसे करें?',
      aHi: 'Withdrawal sirf winning money se hota hai. Amount डालें, UPI ya bank details भरें aur request submit करें।',
    },
    {
      qEn: 'How does referral work?',
      aEn: 'Your referral bonus is credited when your invited user completes an eligible first deposit.',
      qHi: 'रेफरल कैसे काम करता है?',
      aHi: 'Referral bonus tab credit hota hai jab aapke invite kiye hue user ka eligible first deposit successful ho jata hai।',
    },
    {
      qEn: 'Where can I see my history?',
      aEn: 'You can check wallet, deposit, withdrawal, and betting records from your account history sections.',
      qHi: 'हिस्ट्री कहाँ दिखेगी?',
      aHi: 'Wallet, deposit, withdrawal aur betting records aap account ke history sections me dekh sakte hain।',
    },
  ];

  return (
    <div className="min-h-screen bg-[#042346] px-4 pb-12 pt-24 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0a2d55] via-[#0f3766] to-[#08213e] shadow-2xl shadow-black/20">
          <div className="border-b border-white/10 px-6 py-6 md:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-yellow-400">Support</p>
            <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">Need Help Fast?</h1>
            <p className="mt-3 max-w-2xl text-slate-200">
              Deposit, withdrawal, payment approval, ya account issue ho to direct WhatsApp ya Telegram par contact karein.
            </p>
          </div>

          <div className="grid gap-4 px-6 py-6 md:grid-cols-3 md:px-8">
            <a
              href="mailto:support@truewincircle.in"
              className="rounded-2xl border border-white/10 bg-white/5 p-4 transition-transform hover:-translate-y-1 hover:bg-white/10"
            >
              <Mail className="h-8 w-8 text-purple-300" />
              <p className="mt-4 text-lg font-semibold">Email</p>
              <p className="mt-2 text-sm text-slate-300">support@truewincircle.in</p>
            </a>

            <a
              href={links.whatsapp || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-green-400/20 bg-green-500/10 p-4 transition-transform hover:-translate-y-1 hover:bg-green-500/15"
            >
              <MessageCircle className="h-8 w-8 text-green-300" />
              <p className="mt-4 text-lg font-semibold">WhatsApp</p>
              <p className="mt-2 text-sm text-slate-300">Home page wali same WhatsApp link yahin sync rahegi.</p>
            </a>

            <a
              href={links.telegram || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 transition-transform hover:-translate-y-1 hover:bg-blue-500/15"
            >
              <Send className="h-8 w-8 text-blue-300" />
              <p className="mt-4 text-lg font-semibold">Telegram</p>
              <p className="mt-2 text-sm text-slate-300">Home page wali same Telegram link yahin sync rahegi.</p>
            </a>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0b2749] shadow-xl">
          <div className="border-b border-white/10 px-6 py-5 md:px-8">
            <h2 className="text-2xl font-bold text-yellow-400">Frequently Asked Questions</h2>
          </div>

          {faqs.map((faq, index) => (
            <FaqItem
              key={faq.qEn}
              qEn={faq.qEn}
              aEn={faq.aEn}
              qHi={faq.qHi}
              aHi={faq.aHi}
              isOpen={openFaq === index}
              onClick={() => setOpenFaq(openFaq === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Support;
