// One-time migration defaults; public pages read the persisted Settings document.
module.exports = {
  services: [
    { icon: 'bi-braces-asterisk', title: 'MERN Stack Development', text: 'Full-stack web applications with MongoDB, Express, React and Node.js: dashboards, SaaS products, marketplaces and internal tools.', points: ['REST & real-time APIs', 'Role-based auth & security', 'Scalable MongoDB schemas'] },
    { icon: 'bi-cup-hot', title: 'Java / Spring Boot Development', text: 'Robust, enterprise-grade back ends and microservices built on Spring Boot with clean architecture and strong testing.', points: ['Microservices & REST', 'Spring Security & JPA', 'Enterprise integrations'] },
    { icon: 'bi-phone', title: 'React Native Mobile Apps', text: 'Cross-platform iOS and Android apps from a single codebase, with native-feeling performance and polished UX.', points: ['iOS & Android', 'Push notifications', 'Offline-first patterns'] },
    { icon: 'bi-filetype-py', title: 'Python / Django Development', text: 'Secure, maintainable Django applications, admin portals, data-driven back ends and automation.', points: ['Django REST Framework', 'Admin portals', 'Data & automation'] },
    { icon: 'bi-wordpress', title: 'WordPress Development', text: 'Custom themes, plugins and WooCommerce stores that are fast, secure and easy for your team to manage.', points: ['Custom themes & plugins', 'WooCommerce', 'Performance tuning'] },
    { icon: 'bi-palette', title: 'UI/UX Design', text: 'Research-led interface design: wireframes, prototypes and design systems that make products easy to use.', points: ['Wireframes & prototypes', 'Design systems', 'Usability reviews'] },
    { icon: 'bi-cloud-arrow-up', title: 'DevOps & Cloud Deployment', text: 'CI/CD pipelines, containerised deployments and cloud hosting configured for reliability and cost control.', points: ['CI/CD pipelines', 'Docker & cloud', 'Monitoring & backups'] },
    { icon: 'bi-tools', title: 'Website Maintenance', text: 'Ongoing updates, security patches, uptime monitoring and feature work so your product keeps running smoothly.', points: ['Updates & patches', 'Uptime monitoring', 'Priority support'] }
  ],
  technologies: [
    { group: 'Frontend', icon: 'bi-window', items: ['React', 'React Native', 'JavaScript (ES6+)', 'Bootstrap', 'HTML5 / CSS3'] },
    { group: 'Backend', icon: 'bi-braces-asterisk', items: ['Node.js', 'Express.js', 'Java', 'Spring Boot', 'Python', 'Django'] },
    { group: 'Database', icon: 'bi-database', items: ['MongoDB', 'MongoDB Atlas', 'MySQL', 'PostgreSQL'] },
    { group: 'DevOps & Cloud', icon: 'bi-cloud-check', items: ['Git & GitHub', 'Docker', 'CI/CD', 'AWS', 'Nginx'] },
    { group: 'CMS & Design', icon: 'bi-palette', items: ['WordPress', 'WooCommerce', 'Figma'] }
  ],
  workflow: [
    { icon: 'bi-chat-dots', title: 'Discover', text: 'We learn your goals, users and constraints, then agree scope, timeline and budget in a clear quotation.' },
    { icon: 'bi-vector-pen', title: 'Design', text: 'Wireframes and interactive prototypes so you can see and approve the product before we build it.' },
    { icon: 'bi-code-slash', title: 'Build', text: 'Iterative development in milestones with regular demos, so you always know where the project stands.' },
    { icon: 'bi-bug', title: 'Test', text: 'Functional, security and device testing, followed by your review and sign-off.' },
    { icon: 'bi-rocket-takeoff', title: 'Launch & support', text: 'Deployment, structured handover, documentation and optional maintenance after go-live.' }
  ],
  why: [
    { icon: 'bi-person-check', title: 'Senior, hands-on team', text: 'You work directly with the engineers and designers building your product, not an account layer.' },
    { icon: 'bi-eye', title: 'Transparent progress', text: 'Milestones, invoices, documents and progress are visible to you in your own client portal.' },
    { icon: 'bi-shield-lock', title: 'Security by default', text: 'Hardened authentication, validated inputs, audit trails and careful handling of your data.' },
    { icon: 'bi-cash-stack', title: 'Clear, itemised pricing', text: 'Written quotations with scope, deliverables and payment milestones. No surprise charges.' },
    { icon: 'bi-award', title: 'Formal handover', text: 'A checklist-driven handover and completion certificate when your project is delivered.' },
    { icon: 'bi-headset', title: 'Support after launch', text: 'Maintenance plans and a support channel so your product keeps improving.' }
  ],
  aboutStory: [
    'We started as independent developers and designers who kept getting the same feedback from clients: they wanted fewer layers, clearer communication and software they could actually rely on. So we teamed up.',
    'Today we work as a tight team, each project has named owners, written scope, itemised pricing and visible milestones. You can follow progress, invoices and documents in your own client portal.'
  ],
  aboutPrinciples: [
    { icon: 'bi-bullseye', title: 'Mission', text: 'Deliver dependable software that solves real business problems.' },
    { icon: 'bi-eye', title: 'Vision', text: 'Be the engineering partner small and mid-sized businesses trust for the long term.' },
    { icon: 'bi-heart', title: 'Values', text: 'Honesty, craftsmanship, security and clear communication.' }
  ]
};
