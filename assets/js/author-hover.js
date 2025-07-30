// Author profile card hover functionality
document.addEventListener('DOMContentLoaded', function() {
    const authorInfos = document.querySelectorAll('.post-author-info');
    
    authorInfos.forEach(function(authorInfo) {
        const profileCard = authorInfo.querySelector('.author-profile-card');
        let showTimeout;
        let hideTimeout;
        
        if (profileCard) {
            // Show card on hover with 0.5s delay
            authorInfo.addEventListener('mouseenter', function(e) {
                clearTimeout(hideTimeout);
                
                showTimeout = setTimeout(function() {
                    profileCard.classList.add('show');
                }, 500); // 0.5초 지연
            });
            
            // Hide card when mouse leaves
            authorInfo.addEventListener('mouseleave', function() {
                clearTimeout(showTimeout);
                hideTimeout = setTimeout(function() {
                    profileCard.classList.remove('show');
                }, 100);
            });
            
            // Keep card visible when hovering over the card itself
            profileCard.addEventListener('mouseenter', function() {
                clearTimeout(hideTimeout);
                clearTimeout(showTimeout);
                profileCard.classList.add('show');
            });
            
            profileCard.addEventListener('mouseleave', function() {
                hideTimeout = setTimeout(function() {
                    profileCard.classList.remove('show');
                }, 100);
            });
            
            // 링크 클릭 시 이벤트 전파 방지
            const profileLinks = profileCard.querySelectorAll('.profile-link');
            profileLinks.forEach(function(link) {
                link.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
            });
            
            // 전체 카드 클릭 시 이벤트 전파 방지
            profileCard.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    });
});