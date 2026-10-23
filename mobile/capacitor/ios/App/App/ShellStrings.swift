import Foundation

/// Native dialog / prompt strings in the web app's language (en / hi / te),
/// the same texts as android/app/src/main/res/values*/strings.xml.
enum ShellStrings {
    static let supported: Set<String> = ["en", "hi", "te"]

    private static let table: [String: [String: String]] = [
        "en": [
            "biometric_enroll_title": "Unlock with Face ID or Touch ID?",
            "biometric_enroll_body": "Next time, sign in to CodeSpectra with Face ID or Touch ID instead of your password. You can turn this off by signing out.",
            "biometric_enroll_yes": "Turn on",
            "biometric_enroll_no": "Not now",
            "biometric_prompt_title": "Sign in to CodeSpectra",
            "biometric_prompt_reason": "Confirm it's you to sign in",
            "biometric_prompt_cancel": "Use password",
            "lockdown_guided_access": "For this proctored test, turn on Guided Access: triple-click the side button, then tap Start.",
            "lockdown_ok": "OK",
            "capture_shield": "Screen recording or mirroring is on. Your test is hidden while it's on.",
        ],
        "hi": [
            "biometric_enroll_title": "Face ID या Touch ID से अनलॉक करें?",
            "biometric_enroll_body": "अगली बार पासवर्ड की जगह Face ID या Touch ID से CodeSpectra में साइन इन करें। साइन आउट करके आप इसे बंद कर सकते हैं।",
            "biometric_enroll_yes": "चालू करें",
            "biometric_enroll_no": "अभी नहीं",
            "biometric_prompt_title": "CodeSpectra में साइन इन करें",
            "biometric_prompt_reason": "साइन इन करने के लिए पुष्टि करें कि यह आप हैं",
            "biometric_prompt_cancel": "पासवर्ड इस्तेमाल करें",
            "lockdown_guided_access": "इस प्रॉक्टर्ड टेस्ट के लिए Guided Access चालू करें: साइड बटन तीन बार दबाएँ, फिर Start पर टैप करें।",
            "lockdown_ok": "ठीक है",
            "capture_shield": "स्क्रीन रिकॉर्डिंग या मिररिंग चालू है। इसके चालू रहने तक आपका टेस्ट छिपा रहेगा।",
        ],
        "te": [
            "biometric_enroll_title": "Face ID లేదా Touch IDతో అన్‌లాక్ చేయాలా?",
            "biometric_enroll_body": "తదుపరిసారి పాస్‌వర్డ్‌కు బదులుగా Face ID లేదా Touch IDతో CodeSpectraలో సైన్ ఇన్ చేయండి. సైన్ అవుట్ చేసి దీన్ని ఆపవచ్చు.",
            "biometric_enroll_yes": "ఆన్ చేయండి",
            "biometric_enroll_no": "ఇప్పుడు కాదు",
            "biometric_prompt_title": "CodeSpectraలో సైన్ ఇన్ చేయండి",
            "biometric_prompt_reason": "సైన్ ఇన్ చేయడానికి ఇది మీరేనని నిర్ధారించండి",
            "biometric_prompt_cancel": "పాస్‌వర్డ్ ఉపయోగించండి",
            "lockdown_guided_access": "ఈ ప్రాక్టర్డ్ టెస్ట్ కోసం Guided Access ఆన్ చేయండి: సైడ్ బటన్‌ను మూడుసార్లు నొక్కి, Start నొక్కండి.",
            "lockdown_ok": "సరే",
            "capture_shield": "స్క్రీన్ రికార్డింగ్ లేదా మిర్రరింగ్ ఆన్‌లో ఉంది. అది ఆన్‌లో ఉన్నంత వరకు మీ టెస్ట్ దాచబడుతుంది.",
        ],
    ]

    static func get(_ key: String, _ locale: String?) -> String {
        let lang = locale.flatMap { supported.contains($0) ? $0 : nil } ?? "en"
        return table[lang]?[key] ?? table["en"]?[key] ?? key
    }
}
