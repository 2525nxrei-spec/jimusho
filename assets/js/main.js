/* ========================================
   AND SPACE — Main JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Navigation scroll effect ---
  const nav = document.querySelector('.nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    if (currentScroll > 10) {
      nav.classList.add('is-scrolled');
    } else {
      nav.classList.remove('is-scrolled');
    }
    lastScroll = currentScroll;
  }, { passive: true });

  // --- Mobile menu ---
  const hamburger = document.querySelector('.nav__hamburger');
  const overlay = document.querySelector('.nav__overlay');
  const overlayClose = document.querySelector('.nav__overlay-close');
  const overlayLinks = document.querySelectorAll('.nav__overlay a');

  if (hamburger && overlay) {
    hamburger.addEventListener('click', () => {
      overlay.classList.add('is-active');
      document.body.style.overflow = 'hidden';
    });

    const closeMenu = () => {
      overlay.classList.remove('is-active');
      document.body.style.overflow = '';
    };

    overlayClose.addEventListener('click', closeMenu);
    overlayLinks.forEach(link => link.addEventListener('click', closeMenu));
  }

  // --- Scroll reveal ---
  const reveals = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(el => revealObserver.observe(el));

  // --- FAQ accordion ---
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-item__question');
    const answer = item.querySelector('.faq-item__answer');

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      // Close all
      faqItems.forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.faq-item__answer').style.maxHeight = '0';
      });

      // Open clicked
      if (!isOpen) {
        item.classList.add('is-open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 60;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // --- Number counter animation ---
  const numberItems = document.querySelectorAll('.number-item__value');

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-value'), 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 1600;
        const start = performance.now();

        const animate = (now) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 4);
          const current = Math.round(target * eased);
          el.textContent = current.toLocaleString();
          if (suffix) {
            el.innerHTML = current.toLocaleString() + `<span>${suffix}</span>`;
          }
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  numberItems.forEach(el => counterObserver.observe(el));

  // --- Contact form handler ---
  const form = document.querySelector('#contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      // Show success message
      const btn = form.querySelector('.btn');
      const originalText = btn.textContent;
      btn.textContent = '送信しました';
      btn.style.background = '#34c759';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        form.reset();
      }, 2800);

      // In production, send to your backend:
      // fetch('/api/contact', { method: 'POST', body: JSON.stringify(data) })
      console.log('Form submitted:', data);
    });
  }

});
