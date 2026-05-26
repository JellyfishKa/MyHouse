import { memo } from 'react';
import { Descriptions, Modal, Tag, Typography } from 'antd';
import { anomalySeverityLabel } from '../utils/anomalyUtils';
import { kindColor, kindLabel, type NotificationLogEntry } from '../utils/notificationLogUtils';

const { Paragraph, Text } = Typography;

const SEVERITY_TAG: Record<string, string> = {
  low: 'green',
  medium: 'gold',
  high: 'orange',
  critical: 'red',
};

interface NotificationDetailModalProps {
  entry: NotificationLogEntry | null;
  open: boolean;
  onClose: () => void;
}

function NotificationDetailModal({ entry, open, onClose }: NotificationDetailModalProps) {
  if (!entry) return null;

  const accent = kindColor(entry.kind);

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      zIndex={1200}
      className="notification-detail-modal"
      destroyOnClose={false}
      centered
    >
      <div style={{ marginBottom: 12 }}>
        <Tag color={accent} style={{ marginRight: 6 }}>
          {kindLabel(entry.kind)}
        </Tag>
        {entry.horizonDays != null && (
          <Tag color="geekblue">{entry.horizonDays} дн.</Tag>
        )}
        {entry.severity && (
          <Tag color={SEVERITY_TAG[entry.severity] ?? 'default'}>
            {anomalySeverityLabel(entry.severity)}
          </Tag>
        )}
      </div>

      <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
        {entry.title}
      </Text>

      <Paragraph type="secondary" style={{ margin: '0 0 12px', fontSize: 13 }}>
        {entry.summary}
      </Paragraph>

      <div
        style={{
          background: 'rgba(13, 40, 24, 0.04)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
          borderLeft: `3px solid ${accent}`,
        }}
      >
        <Text style={{ fontSize: 12, lineHeight: 1.55 }}>
          {entry.detail}
        </Text>
      </div>

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Время">
          {new Date(entry.timestamp).toLocaleString('ru-RU')}
        </Descriptions.Item>
        {entry.category && (
          <Descriptions.Item label="Линия">{entry.category}</Descriptions.Item>
        )}
        {entry.valueLabel && (
          <Descriptions.Item label="Отклонение">{entry.valueLabel}</Descriptions.Item>
        )}
        {entry.pattern && (
          <Descriptions.Item label="Паттерн">{entry.pattern}</Descriptions.Item>
        )}
      </Descriptions>
    </Modal>
  );
}

export default memo(NotificationDetailModal);
