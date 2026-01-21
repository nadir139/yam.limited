// Main JavaScript for YAM Website

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Form handling
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Add scroll effects
    window.addEventListener('scroll', handleScroll);
});

// Form submission handler
function handleFormSubmit(e) {
    e.preventDefault();
    
    // Get form data
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    // Validate required fields
    if (!data.name || !data.email || !data.project) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Create mailto link
    const subject = encodeURIComponent(`YAM Project Inquiry - ${data.project}`);
    const body = encodeURIComponent(`Name: ${data.name}
Email: ${data.email}
Project Type: ${data.project}
Timeline: ${data.timeline || 'Not specified'}

Project Details:
${data.message || 'No additional details provided'}`);
    
    const mailtoLink = `mailto:nadir.balena@gmail.com?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
}

// Scroll effects handler
function handleScroll() {
    const scrolled = window.pageYOffset;
    const parallax = document.querySelector('.hero');
    
    if (parallax) {
        const speed = scrolled * 0.5;
        parallax.style.transform = `translateY(${speed}px)`;
    }
}

// Add fade-in animation for service cards
function addScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    });

    document.querySelectorAll('.service-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', addScrollAnimations);