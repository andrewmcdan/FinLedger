const errorModal = document.getElementById('error_notification_modal');
const errorMessageElement = document.getElementById('error_notification_message');
const errorCloseButton = document.getElementById('error_notification_close_button');

const messageModal = document.getElementById('message_notification_modal');
const messageTextElement = document.getElementById('message_notification_message');
const messageCloseButton = document.getElementById('message_notification_close_button');

async function showErrorModal(message) {
    errorMessageElement.textContent = message;
    errorModal.classList.remove('hidden');
    errorModal.classList.add('is-visible');
    errorModal.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
        const closeModal = () => {
            errorModal.classList.add('hidden');
            errorModal.classList.remove('is-visible');
            errorModal.setAttribute('aria-hidden', 'true');
            errorCloseButton.removeEventListener('click', closeModal);
            resolve();
        };

        errorCloseButton.addEventListener('click', closeModal);
    });
}

async function showMessageModal(message) {
    messageTextElement.textContent = message;
    messageModal.classList.remove('hidden');
    messageModal.classList.add('is-visible');
    messageModal.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
        const closeModal = () => {
            messageModal.classList.add('hidden');
            messageModal.classList.remove('is-visible');
            messageModal.setAttribute('aria-hidden', 'true');
            messageCloseButton.removeEventListener('click', closeModal);
            resolve();
        };

        messageCloseButton.addEventListener('click', closeModal);
    });
}

export { showErrorModal, showMessageModal };