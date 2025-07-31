document.addEventListener('DOMContentLoaded', function() {
    // 기존 프로필 카드 제거
    const existingCard = document.getElementById('global-author-profile-card');
    if (existingCard) {
        existingCard.remove();
    }
    
    // 새로운 프로필 카드 생성
    const profileCard = document.createElement('div');
    profileCard.id = 'global-author-profile-card';
    profileCard.className = 'author-profile-card';
    profileCard.style.cssText = `
        position: fixed;
        top: -1000px;
        left: -1000px;
        background: white;
        border: 1px solid #f2f2f2;
        border-radius: 8px;
        padding: 16px;
        width: 400px;
        box-shadow: rgba(0, 0, 0, 0.15) 0px 2px 10px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-6px) scale(0.95);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
    `;
    
    profileCard.innerHTML = `
        <div class="profile-header" style="display: flex; flex-direction: row; align-items: center; text-align: center; margin-bottom: 10px;">
            <img src="/assets/images/profile-avatar.jpeg" 
                 alt="Profile Avatar" 
                 class="profile-avatar"
                 style="width: 59px; height: 59px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;">
            <div class="profile-info" style="display: flex; flex-direction: column; align-items: right; text-align: left; margin: 0 0 0 30px;">        
                <h4 style="margin: 0 0 5px 0; font-size: 20px; font-weight: 500; color: #242424; line-height: 1.2;">Sangjun Cho (조상준)</h4>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #757575; line-height: 1.4;">Computer Engineering Student at Sejong Univ</p>
                <div class="profile-links" style="display: flex; flex-direction: row; gap: 5px;">
                    <a href="mailto:juncho12011201@gmail.com" class="profile-link" style="color: #1a8917; text-decoration: none; font-size: 12px; font-weight: 500;">✉️ Contact</a>
                    <a href="https://github.com/sangjun121" target="_blank" class="profile-link" style="color: #1a8917; text-decoration: none; font-size: 12px; font-weight: 500;">🔗 GitHub</a>
                    <a href="https://sangjun121.github.io" target="_blank" class="profile-link" style="color: #1a8917; text-decoration: none; font-size: 12px; font-weight: 500;">🌐 Blog</a>
                </div>
            </div>
        </div>
    `;
    
    // <div class="profile-description" style="font-size: 12px; color: #242424; line-height: 1.5; margin-bottom: 11px;">
    //         Hello! I'm Sangjun Cho, a backend developer.
    //     </div>
        

    // body에 추가
    document.body.appendChild(profileCard);
    
    const authorInfos = document.querySelectorAll('.post-author-info');
    let showTimeout;
    let hideTimeout;
    
    function showCard(authorInfo) {
        clearTimeout(hideTimeout);
        
        showTimeout = setTimeout(() => {
            const rect = authorInfo.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let left = rect.left;
            let top = rect.bottom + 10;
            
            // 뷰포트 경계 확인
            const cardWidth = 280;
            const cardHeight = 350;
            
            if (left + cardWidth > viewportWidth) {
                left = viewportWidth - cardWidth - 20;
            }
            
            if (top + cardHeight > viewportHeight) {
                top = rect.top - cardHeight - 10;
            }
            
            if (left < 0) left = 10;
            if (top < 0) top = rect.bottom + 10;
            
            profileCard.style.left = left + 'px';
            profileCard.style.top = top + 'px';
            profileCard.style.opacity = '1';
            profileCard.style.visibility = 'visible';
            profileCard.style.transform = 'translateY(0) scale(1)';
            profileCard.style.pointerEvents = 'auto';
        }, 500);
    }
    
    function hideCard() {
        clearTimeout(showTimeout);
        hideTimeout = setTimeout(() => {
            profileCard.style.opacity = '0';
            profileCard.style.visibility = 'hidden';
            profileCard.style.transform = 'translateY(-6px) scale(0.95)';
            profileCard.style.pointerEvents = 'none';
        }, 100);
    }
    
    // 이벤트 리스너 추가
    authorInfos.forEach(authorInfo => {
        authorInfo.addEventListener('mouseenter', () => showCard(authorInfo));
        authorInfo.addEventListener('mouseleave', hideCard);
    });
    
    profileCard.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
        clearTimeout(showTimeout);
    });
    
    profileCard.addEventListener('mouseleave', hideCard);
});