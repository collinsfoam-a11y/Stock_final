import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface ItemVerificationProps {
  sqlVerifiedQty?: number;
  mongoQty: number;
  variance?: number;
  lastVerifiedAt?: string;
  mismatchFlag?: boolean;
  onVerify?: () => void;
}

const ItemVerification: React.FC<ItemVerificationProps> = ({
  sqlVerifiedQty,
  mongoQty,
  variance,
  lastVerifiedAt,
  mismatchFlag,
  onVerify,
}) => {
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatQuantity = (qty: number) => {
    return qty.toFixed(2);
  };

  const getVarianceColor = (variance?: number) => {
    if (!variance) return '#666';
    if (variance > 0) return '#4CAF50'; // Green - excess
    if (variance < 0) return '#F44336'; // Red - shortage
    return '#666';
  };

  const getVarianceIcon = (variance?: number) => {
    if (!variance) return 'remove-outline' as const;
    if (variance > 0) return 'arrow-up-outline' as const;
    if (variance < 0) return 'arrow-down-outline' as const;
    return 'remove-outline' as const;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quantity Verification</Text>
        {onVerify && (
          <TouchableOpacity style={styles.verifyButton} onPress={onVerify}>
            <Ionicons name="refresh" size={20} color="#007AFF" />
            <Text style={styles.verifyButtonText}>Verify</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.quantitiesContainer}>
        <View style={styles.quantityItem}>
          <View style={styles.labelContainer}>
            <View style={[styles.dot, { backgroundColor: sqlVerifiedQty !== undefined ? '#4CAF50' : '#F44336' }]} />
            <Text style={styles.quantityLabel}>Source (SQL)</Text>
          </View>
          <Text style={styles.quantityValue}>
            {sqlVerifiedQty !== undefined ? formatQuantity(sqlVerifiedQty) : 'Offline'}
          </Text>
        </View>

        <View style={styles.quantityItem}>
          <View style={styles.labelContainer}>
            <View style={[styles.dot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.quantityLabel}>App Data</Text>
          </View>
          <Text style={styles.quantityValue}>{formatQuantity(mongoQty)}</Text>
        </View>

        {variance !== undefined && (
          <View style={styles.quantityItem}>
            <Text style={styles.quantityLabel}>Variance</Text>
            <View style={styles.varianceContainer}>
              <Ionicons
                name={getVarianceIcon(variance)}
                size={16}
                color={getVarianceColor(variance)}
              />
              <Text style={[styles.varianceValue, { color: getVarianceColor(variance) }]}>
                {variance > 0 ? '+' : ''}{formatQuantity(variance)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {mismatchFlag && (
        <View style={styles.warningContainer}>
          <Ionicons name="alert-circle-outline" size={16} color="#FF9800" />
          <Text style={styles.warningText}>
            Variance detected against cached data.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.lastVerified}>
          Last verified: {formatDateTime(lastVerifiedAt)}
        </Text>
        {sqlVerifiedQty === undefined && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={12} color="#F44336" style={{ marginRight: 4 }} />
            <Text style={[styles.notVerifiedText, { color: '#F44336' }]}>Source Disconnected</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  verifyButtonText: {
    color: '#007AFF',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  quantitiesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  quantityItem: {
    alignItems: 'center',
  },
  quantityLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  varianceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  varianceValue: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 4,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  warningText: {
    color: '#E65100',
    marginLeft: 8,
    fontSize: 12,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastVerified: {
    fontSize: 11,
    color: '#999',
  },
  notVerifiedText: {
    fontSize: 11,
    color: '#007AFF',
    fontStyle: 'italic',
  },
});

export default ItemVerification;
