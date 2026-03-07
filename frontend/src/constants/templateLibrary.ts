import { Template } from '../types';

export const TEMPLATE_CATEGORIES = [
    'E-commerce & Retail',
    'Real Estate',
    'Education',
    'Healthcare & Clinic',
    'Agency & Services',
    'Financial Services',
    'Automotive',
    'Hospitality & Travel',
    'Recruitment & HR',
    'Customer Support',
    'Event Management',
    'General & Announcements'
];

export const PREDEFINED_TEMPLATES: Partial<Template>[] = [
    // E-COMMERCE & RETAIL
    {
        id: 'lib_ecom_1',
        title: 'Order Confirmation',
        category: 'E-commerce & Retail',
        content: 'Hello [Name]!\n\nThank you for shopping with [Company]. We have received your order and it is currently being processed.\n\nWe will notify you once it has been shipped to [City].\n\nThanks,\n[Company] Team',
    },
    {
        id: 'lib_ecom_2',
        title: 'Order Shipped Alert',
        category: 'E-commerce & Retail',
        content: 'Great news, [Name]! 🎉\n\nYour order from [Company] has been shipped and is on its way to your address at [Address].\n\nYou can expect delivery soon. Thank you for your continued support!\n\nBest Regards,\n[Company]',
    },
    {
        id: 'lib_ecom_3',
        title: 'Abandoned Cart Reminder',
        category: 'E-commerce & Retail',
        content: 'Hi [Name],\n\nWe noticed you left some amazing items in your cart at [Company]! 🛒\n\nComplete your purchase today and enjoy an exclusive 10% discount using code: WELCOME10.\n\nHurry before stocks run out!',
    },
    {
        id: 'lib_ecom_4',
        title: 'Flash Sale Announcement',
        category: 'E-commerce & Retail',
        content: 'FLASH SALE ALERT! ⚡\n\nHi [Name], massive discounts are now live at [Company]. Get up to 50% OFF on all premium items in our [City] store and online.\n\nShop Now before the sale ends at midnight!',
    },
    {
        id: 'lib_ecom_5',
        title: 'Product Review Request',
        category: 'E-commerce & Retail',
        content: 'Hello [Name],\n\nWe hope you are enjoying your recent purchase from [Company]. 🌟\n\nCould you take a minute to share your feedback? Your review helps us serve you better.\n\nThank you!',
    },

    // REAL ESTATE
    {
        id: 'lib_re_1',
        title: 'New Property Listing',
        category: 'Real Estate',
        content: 'Hello [Name] 🏡,\n\nWe have an exciting new property listing in [City] that matches your preferences.\n\nLet us know if you would like to schedule a viewing or need more details.\n\nBest,\n[Company]',
    },
    {
        id: 'lib_re_2',
        title: 'Site Visit Confirmation',
        category: 'Real Estate',
        content: 'Hi [Name],\n\nThis is to confirm our site visit scheduled for [Date] at [Time] for the property located in [City].\n\nOur agent will meet you there. If you need to reschedule, please inform us.\n\nRegards,\n[Company] Real Estate',
    },
    {
        id: 'lib_re_3',
        title: 'Follow-up After Visit',
        category: 'Real Estate',
        content: 'Hello [Name],\n\nThank you for taking the time to view the property with [Company] today.\n\nWe would love to hear your thoughts. If you have any further questions or wish to proceed with an offer, kindly let us know.\n\nWarm regards,\n[Company]',
    },

    // EDUCATION
    {
        id: 'lib_edu_1',
        title: 'Course Enrollment Success',
        category: 'Education',
        content: 'Welcome to [Company], [Name]! 🎓\n\nYour enrollment has been successfully processed. We are thrilled to have you onboard.\n\nCheck your email at [Email] for login credentials and further instructions.',
    },
    {
        id: 'lib_edu_2',
        title: 'Upcoming Class Reminder',
        category: 'Education',
        content: 'Hi [Name],\n\nJust a quick reminder that your next session at [Company] starts on [Date] at [Time].\n\nPlease ensure you are logged in 5 minutes early. See you in class!',
    },
    {
        id: 'lib_edu_3',
        title: 'Fee Payment Reminder',
        category: 'Education',
        content: 'Dear [Name],\n\nThis is a gentle reminder that your tuition fee installment for [Company] is due soon.\n\nPlease complete the payment by [Date] to avoid any late fees. Let us know if you need assistance.',
    },
    {
        id: 'lib_edu_4',
        title: 'New Batch Announcement',
        category: 'Education',
        content: 'Hello [Name]! 🚀\n\nEnrollments are now open for our new upcoming batch at [Company]. Secure your seat today and get early bird discounts.\n\nReply to this message to know more!',
    },

    // HEALTHCARE & CLINIC
    {
        id: 'lib_health_1',
        title: 'Appointment Confirmation',
        category: 'Healthcare & Clinic',
        content: 'Hello [Name],\n\nYour appointment at [Company] in [City] is confirmed for [Date] at [Time].\n\nPlease arrive 10 minutes early. If you need to cancel or modify your booking, reply to this message.',
    },
    {
        id: 'lib_health_2',
        title: 'Health Checkup Reminder',
        category: 'Healthcare & Clinic',
        content: 'Dear [Name],\n\nIt has been a while since your last visit to [Company]. \n\nWe recommend scheduling your routine health checkup soon to stay on top of your well-being. Book your slot today! 🩺',
    },
    {
        id: 'lib_health_3',
        title: 'Test Reports Ready',
        category: 'Healthcare & Clinic',
        content: 'Hi [Name],\n\nYour lab reports from [Company] are now ready for collection or can be viewed online.\n\nIf you have scheduled a follow-up consultation, please carry the reports with you.\n\nStay healthy!',
    },

    // AGENCY & SERVICES
    {
        id: 'lib_ag_1',
        title: 'Service Inquiry Acknowledgment',
        category: 'Agency & Services',
        content: 'Hi [Name],\n\nThank you for reaching out to [Company]! We have received your inquiry.\n\nOne of our experts will get back to you shortly to discuss how we can help you grow your business in [City].',
    },
    {
        id: 'lib_ag_2',
        title: 'Project Update',
        category: 'Agency & Services',
        content: 'Hello [Name],\n\nHere is a quick update regarding your ongoing project with [Company]. We have successfully completed the latest milestone!\n\nPlease check your email ([Email]) for the detailed report.',
    },
    {
        id: 'lib_ag_3',
        title: 'Invoice Generation',
        category: 'Agency & Services',
        content: 'Dear [Name],\n\nWe have generated the invoice for the recent services provided by [Company].\n\nThe details have been sent to [Email]. Please process the payment by [Date]. Thank you for doing business with us!',
    },
    {
        id: 'lib_ag_4',
        title: 'Maintenance Reminder',
        category: 'Agency & Services',
        content: 'Hi [Name],\n\nIt is time for your scheduled maintenance service by [Company].\n\nOur team will visit your location at [Address] on [Date]. Let us know if this time works for you. 🛠️',
    },

    // FINANCIAL SERVICES
    {
        id: 'lib_fin_1',
        title: 'Loan Approval Notification',
        category: 'Financial Services',
        content: 'Congratulations [Name]! 🎉\n\nYour loan application with [Company] has been approved.\n\nOur representative from the [City] branch will call you shortly to discuss the final disbursement process.',
    },
    {
        id: 'lib_fin_2',
        title: 'Premium Payment Follow-up',
        category: 'Financial Services',
        content: 'Dear [Name],\n\nThis is a reminder regarding your insurance premium payment at [Company].\n\nTo ensure uninterrupted coverage, please complete your payment by [Date]. If already paid, kindly ignore this message.',
    },
    {
        id: 'lib_fin_3',
        title: 'Investment Plan Offer',
        category: 'Financial Services',
        content: 'Hi [Name],\n\nLooking to secure your future? [Company] is introducing a high-yield investment plan with maximum returns.\n\nReply "YES" to connect with our financial advisor for a free consultation today! 📈',
    },

    // AUTOMOTIVE
    {
        id: 'lib_auto_1',
        title: 'Vehicle Servicing Reminder',
        category: 'Automotive',
        content: 'Hi [Name] 🚗,\n\nIt is time for your vehicle\'s scheduled servicing at [Company].\n\nRegular maintenance ensures longevity. Book your service slot today at our [City] workshop and get 10% off on labor charges!',
    },
    {
        id: 'lib_auto_2',
        title: 'Service Completion Alert',
        category: 'Automotive',
        content: 'Hello [Name],\n\nGreat news! Your vehicle is fully serviced and ready for pickup at [Company] ([City] Branch).\n\nPlease visit the service center before [Time]. Drive safe!',
    },
    {
        id: 'lib_auto_3',
        title: 'New Car Launch Invitation',
        category: 'Automotive',
        content: 'Dear [Name],\n\nYou are exclusively invited to the grand launch of our newest model at [Company] showroom in [City]!\n\nJoin us on [Date] to experience the future of driving. 🚙✨',
    },

    // HOSPITALITY & TRAVEL
    {
        id: 'lib_hosp_1',
        title: 'Booking Confirmation',
        category: 'Hospitality & Travel',
        content: 'Dear [Name],\n\nYour reservation at [Company] is confirmed for [Date].\n\nWe are looking forward to hosting you in [City]. Please let us know if you require airport transfers or any special arrangements. 🏨',
    },
    {
        id: 'lib_hosp_2',
        title: 'Check-in Instructions',
        category: 'Hospitality & Travel',
        content: 'Hi [Name],\n\nWelcome to [City]! Safe travels. Just a reminder that check-in at [Company] begins at [Time].\n\nYou can find our property at [Address]. See you soon!',
    },
    {
        id: 'lib_hosp_3',
        title: 'Post-Trip Feedback',
        category: 'Hospitality & Travel',
        content: 'Hello [Name],\n\nWe hope you had a wonderful stay with [Company].\n\nCould you spare a moment to rate your experience? Your feedback helps us improve our services for your next visit. ✈️',
    },

    // RECRUITMENT & HR
    {
        id: 'lib_hr_1',
        title: 'Interview Invitation',
        category: 'Recruitment & HR',
        content: 'Hello [Name],\n\nThank you for applying to [Company]!\n\nWe are impressed with your profile and would like to invite you for an interview on [Date] at [Time]. Please confirm your availability.',
    },
    {
        id: 'lib_hr_2',
        title: 'Application Received',
        category: 'Recruitment & HR',
        content: 'Hi [Name],\n\nWe have successfully received your application for the open position at [Company] ([City] office).\n\nOur HR team is currently reviewing your profile and will get back to you shortly.',
    },
    {
        id: 'lib_hr_3',
        title: 'Job Offer Confirmation',
        category: 'Recruitment & HR',
        content: 'Congratulations [Name]! 🥳\n\nWe are thrilled to extend a job offer to you from [Company]. Please check your email ([Email]) for the detailed offer letter and next steps.\n\nWelcome to the team!',
    },

    // CUSTOMER SUPPORT
    {
        id: 'lib_cs_1',
        title: 'Ticket Received Acknowledgment',
        category: 'Customer Support',
        content: 'Hi [Name],\n\nWe have received your support request. A ticket has been generated and our team at [Company] is looking into it.\n\nWe will update you as soon as possible.',
    },
    {
        id: 'lib_cs_2',
        title: 'Issue Resolved',
        category: 'Customer Support',
        content: 'Hello [Name],\n\nWe are writing to inform you that your reported issue has been successfully resolved by the [Company] support team.\n\nIf you still face any difficulties, please let us know. ✅',
    },
    {
        id: 'lib_cs_3',
        title: 'Apology for Delay/Outage',
        category: 'Customer Support',
        content: 'Dear [Name],\n\nWe sincerely apologize for the recent service interruption at [Company].\n\nOur engineers have identified the issue and are restoring services. Thank you for your patience and understanding.',
    },

    // EVENT MANAGEMENT
    {
        id: 'lib_event_1',
        title: 'Event Ticket Confirmation',
        category: 'Event Management',
        content: 'Hello [Name]!\n\nYour ticket for the upcoming event by [Company] in [City] is confirmed for [Date].\n\nPlease keep this message handy as it will be checked at the entrance. Get ready for an amazing experience! 🎫',
    },
    {
        id: 'lib_event_2',
        title: 'Event Reminder',
        category: 'Event Management',
        content: 'Hi [Name],\n\nThe big day is almost here! Join us for the spectacular event by [Company] tomorrow at [Time].\n\nVenue: [Address]. Don\'t be late! 🎉',
    },
    {
        id: 'lib_event_3',
        title: 'Post-Event Appreciation',
        category: 'Event Management',
        content: 'Dear [Name],\n\nThank you for attending our event in [City]. It was a massive success because of you!\n\nWe hope to see you again at future [Company] events. Have a great day!',
    },

    // GENERAL & ANNOUNCEMENTS
    {
        id: 'lib_gen_1',
        title: 'Festival Greetings',
        category: 'General & Announcements',
        content: 'Wishing you a very Happy Festival, [Name]! ✨\n\nMay this season bring you joy, prosperity, and happiness. \n\nWarm regards from the entire team at [Company].',
    },
    {
        id: 'lib_gen_2',
        title: 'Important Policy Update',
        category: 'General & Announcements',
        content: 'Notice for all customers: \n\nHi [Name], we have updated our terms and conditions at [Company] to serve you better.\n\nPlease check your email ([Email]) for the detailed document. Thank you!',
    },
    {
        id: 'lib_gen_3',
        title: 'General Welcome Message',
        category: 'General & Announcements',
        content: 'Welcome to [Company], [Name]! 👋\n\nWe are excited to have you with us. If you have any queries about our services in [City], feel free to ask here.\n\nHave a wonderful day!',
    }
];
