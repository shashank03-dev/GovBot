import { SSP_STEPS } from './sspDraft.mjs';

const CONTENT = {
  en: {
    language: 'en',
    defaultLanguage: 'en',
    portalRoute: '/ssp',
    portalName: 'State Scholarship Portal',
    governmentName: 'Government of Karnataka',
    topLinks: ['Department', 'Downloads'],
    landing: {
      title: 'STATE SCHOLARSHIP PORTAL',
      subtitle: 'State Scholarship Portal',
      createAccountLabel: 'Click here to create new account',
      postMatricLoginLabel: 'Click here to login to SSP student account for post matric scholarship',
      preMatricLoginLabel: 'Click here to login to SSP student account for pre matric scholarship',
      notices: [
        'Required documents and profile information should be kept ready before you start the application.',
        'NSP-OTR and department notifications should be reviewed before final submission.',
      ],
      schemesTitle: 'Schemes',
      helplineTitle: 'Helpline',
    },
    dashboard: {
      title: 'Enter all details in each step',
      instructionsTitle: 'Important instructions for students',
      instructions: [
        'Review the user manual before submitting the application.',
        'Incorrect information may lead to rejection by the sponsoring department.',
        'Aadhaar seeding and NPCI mapping must be completed for scholarship disbursement.',
        'Class 10, caste, income, and disability details must belong to the student.',
      ],
      steps: SSP_STEPS.map((step) => ({
        ...step,
        actionLabel: 'Apply',
      })),
    },
    common: {
      home: 'Home',
      back: 'Back',
      next: 'Next',
      save: 'Save Draft',
      finalSubmit: 'Final Submit',
      alreadySubmitted: 'Already Final Submit Done...!!!',
      declaration:
        'Declaration: This is to confirm that the above mentioned information is true to the best of my belief.',
    },
  },
  kn: {
    language: 'kn',
    defaultLanguage: 'en',
    portalRoute: '/ssp',
    portalName: 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್',
    governmentName: 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ',
    topLinks: ['ಇಲಾಖೆ', 'ಡೌನ್‌ಲೋಡ್ಸ್'],
    landing: {
      title: 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್',
      subtitle: 'ರಾಜ್ಯ ವಿದ್ಯಾರ್ಥಿವೇತನ ಪೋರ್ಟಲ್',
      createAccountLabel: 'ಹೊಸ ಖಾತೆ ತೆರೆಯಲು ಇಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ',
      postMatricLoginLabel: 'ಪೋಸ್ಟ್ ಮ್ಯಾಟ್ರಿಕ್ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕಾಗಿ ಎಸ್‌ಎಸ್‌ಪಿ ಲಾಗಿನ್ ಮಾಡಲು ಇಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ',
      preMatricLoginLabel: 'ಪ್ರೀ ಮ್ಯಾಟ್ರಿಕ್ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕಾಗಿ ಎಸ್‌ಎಸ್‌ಪಿ ಲಾಗಿನ್ ಮಾಡಲು ಇಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ',
      notices: [
        'ಅರ್ಜಿಯನ್ನು ಪ್ರಾರಂಭಿಸುವ ಮೊದಲು ಅಗತ್ಯ ದಾಖಲೆಗಳು ಮತ್ತು ಪ್ರೊಫೈಲ್ ಮಾಹಿತಿ ಸಿದ್ಧವಾಗಿರಲಿ.',
        'ಅಂತಿಮ ಸಲ್ಲಿಕೆಯ ಮೊದಲು NSP-OTR ಮತ್ತು ಇಲಾಖೆಯ ಸೂಚನೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
      ],
      schemesTitle: 'ಯೋಜನೆಗಳು',
      helplineTitle: 'ಸಹಾಯವಾಣಿ',
    },
    dashboard: {
      title: 'ಪ್ರತಿ ಹಂತದಲ್ಲೂ ಎಲ್ಲಾ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ',
      instructionsTitle: 'ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಮುಖ್ಯ ಸೂಚನೆಗಳು',
      instructions: [
        'ಅರ್ಜಿಯನ್ನು ಸಲ್ಲಿಸುವ ಮೊದಲು ಬಳಕೆದಾರ ಕೈಪಿಡಿಯನ್ನು ಪರಿಶೀಲಿಸಿ.',
        'ತಪ್ಪಾದ ಮಾಹಿತಿಯು ಇಲಾಖೆಯಿಂದ ಅರ್ಜಿ ತಿರಸ್ಕರಣೆಗೆ ಕಾರಣವಾಗಬಹುದು.',
        'ವಿದ್ಯಾರ್ಥಿವೇತನ ಬಿಡುಗಡೆಗೆ ಆಧಾರ್ ಸೀಡಿಂಗ್ ಮತ್ತು NPCI ಮ್ಯಾಪಿಂಗ್ ಕಡ್ಡಾಯ.',
        '10ನೇ ತರಗತಿ, ಜಾತಿ, ಆದಾಯ ಮತ್ತು ಅಂಗವೈಕಲ್ಯ ವಿವರಗಳು ವಿದ್ಯಾರ್ಥಿಯದ್ದಾಗಿರಬೇಕು.',
      ],
      steps: SSP_STEPS.map((step) => ({
        ...step,
        actionLabel: 'Apply',
      })),
    },
    common: {
      home: 'ಮುಖಪುಟ',
      back: 'ಹಿಂದೆ',
      next: 'ಮುಂದೆ',
      save: 'ಕರಡು ಉಳಿಸಿ',
      finalSubmit: 'ಅಂತಿಮ ಸಲ್ಲಿಕೆ',
      alreadySubmitted: 'ಅಂತಿಮ ಸಲ್ಲಿಕೆ ಈಗಾಗಲೇ ಆಗಿದೆ...!!!',
      declaration:
        'ಘೋಷಣೆ: ಮೇಲಿನ ಮಾಹಿತಿಯು ನನ್ನ ತಿಳುವಳಿಕೆಯ ಮಟ್ಟಿಗೆ ಸತ್ಯವಾಗಿದೆ ಎಂದು ದೃಢೀಕರಿಸುತ್ತೇನೆ.',
    },
  },
};

export function getSSPContent(language = 'en') {
  return CONTENT[language] || CONTENT.en;
}
